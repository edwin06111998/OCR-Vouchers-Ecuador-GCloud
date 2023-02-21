const vision = require('@google-cloud/vision');
const resource = require('./recursos');
const XMLHttpRequest = require('xhr2');
const Jimp = require('jimp');
var indicador_cheque = false;

function getCurrentDate() {
    const date = new Date();
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();
    // This arrangement can be altered based on how we want the date's format to appear.
    let currentDate = `${year}${month}${day}`;
    return currentDate;
}

const setCustomField = (subscriber_id, field_id, field_value, tokenManychat) => {
    console.log("Entra setCustomFields");
    return new Promise((resolve, reject) => {
        var url_send_flow = "https://api.manychat.com/fb/subscriber/setCustomField";
        var body = {
            "subscriber_id": subscriber_id, "field_id": field_id, "field_value": field_value
        }
        var params = JSON.stringify(body);
        var xhr_sendFlow = new XMLHttpRequest();
        xhr_sendFlow.open("POST", url_send_flow);
        xhr_sendFlow.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr_sendFlow.setRequestHeader("Authorization", `Bearer ${tokenManychat}`);
        xhr_sendFlow.onreadystatechange = function () {
            if (xhr_sendFlow.readyState === XMLHttpRequest.DONE && xhr_sendFlow.status === 200) {
                console.log(xhr_sendFlow.responseText);
                resolve(xhr_sendFlow.status);
            }
        };
        xhr_sendFlow.send(params);
    })
}

const sendFlow_manychat = (subscriber_id, flow_ns, token_manychat) => {
    return new Promise((resolve, reject) => {
        var url_send_flow = "https://api.manychat.com/fb/sending/sendFlow";
        var params_send_flow = { "subscriber_id": subscriber_id, "flow_ns": flow_ns }
        var xhr_sendFlow = new XMLHttpRequest();
        xhr_sendFlow.open("POST", url_send_flow);
        xhr_sendFlow.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr_sendFlow.setRequestHeader("Authorization", `Bearer ${token_manychat}`);
        xhr_sendFlow.onreadystatechange = function () {
            if (xhr_sendFlow.readyState === XMLHttpRequest.DONE && xhr_sendFlow.status === 200) {
                console.log(xhr_sendFlow.status);
                resolve(xhr_sendFlow.responseText);
            }
        };
        xhr_sendFlow.send(JSON.stringify(params_send_flow));
    })
}

const getInvoices = (token_mikrowisp, estado, id) => {
    return new Promise((resolve, reject) => {
        var url_send_flow = "mikrowisp_domain/api/v1/GetInvoices";
        var body = {
            "token": token_mikrowisp, "estado": estado, "idcliente": id
        }
        var params = JSON.stringify(body);
        var xhr_sendFlow = new XMLHttpRequest();
        xhr_sendFlow.open("POST", url_send_flow);
        xhr_sendFlow.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr_sendFlow.onreadystatechange = function () {
            if (xhr_sendFlow.readyState === XMLHttpRequest.DONE && xhr_sendFlow.status === 200) {
                console.log(xhr_sendFlow.status);
                resolve(xhr_sendFlow.responseText);
            }
        };
        xhr_sendFlow.send(params);
    })
}

const pagar_factura = (num_factura, num_comprobante, tipo_comprobante, valor, subscriber_id, token_mikrowisp) => {
    return new Promise((resolve, reject) => {
        try {
            var url = "mikrowisp_domain/api/v1/PaidInvoice";
            var fecha = getCurrentDate();
            var pasarela = `MAXI ${fecha}-${num_comprobante}-${subscriber_id}${tipo_comprobante}`;
            var params = { "token": token_mikrowisp, "idfactura": num_factura, "pasarela": pasarela, "cantidad": valor, "idtransaccion": num_comprobante }
            var xhr_pagarFactura = new XMLHttpRequest();
            console.log("params: ", params);
            xhr_pagarFactura.open("POST", url);
            xhr_pagarFactura.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            xhr_pagarFactura.onreadystatechange = function () {
                if (xhr_pagarFactura.readyState === XMLHttpRequest.DONE && xhr_pagarFactura.status === 200) {
                    console.log(xhr_pagarFactura.status);
                    resolve(xhr_pagarFactura.responseText);
                }
            };
            xhr_pagarFactura.send(JSON.stringify(params));
        } catch (e) {
            reject(Error(e));
        }
    });
}

const pagar_facturas = (id_cliente, controlCliente, pasarela, valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id) => {
    return new Promise((resolve, reject) => {
        try {
            getInvoices(token_mikrowisp, 1, id_cliente).then(async function (result) {
                var indicador_pago_procesado = false
                var indicador_flujo_enviado = false
                var indicador_terminar_loop = false
                var respuesta_mikrowisp = ""
                var contador = 0
                var valor_recibo = parseFloat(valorCliente)
                var result_json = JSON.parse(result)
                var facturas = result_json["facturas"].reverse()
                var num_comprobante = controlCliente
                for (let index in facturas) {
                    if(indicador_terminar_loop == true) {
                        break;
                    }
                    var factura = facturas[index]
                    var num_factura = factura.id
                    var valor_factura = parseFloat(factura.total)
                    console.log("Valor factura: ", valor_factura)
                    console.log("Valor recibo: ", valor_recibo)
                    if (valor_factura <= valor_recibo) {
                        if (contador == 0) {
                            await pagar_factura(num_factura, num_comprobante, pasarela, valor_factura, subscriber_id, token_mikrowisp).then(async function (result) {
                                var resultado_json = JSON.parse(result)
                                if (resultado_json.estado == "exito") {
                                    valor_recibo -= valor_factura
                                    contador += 1
                                    indicador_pago_procesado = true
                                    await setCustomField(subscriber_id, field_id, num_factura, token_manychat).then(async function (r) {
                                        await sendFlow_manychat(subscriber_id, flow_ns_pago_parcial, token_manychat).then(function (s) {
                                        });
                                    });
                                } else {
                                    indicador_terminar_loop = true     
                                    respuesta_mikrowisp = result  
                                    sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                                        resolve(respuesta_mikrowisp);
                                    });     
                                }
                            })
                        } else {
                            console.log("Contador diferente de cero")
                            await pagar_factura(num_factura, `${num_comprobante}(${num_factura})`, pasarela, valor_factura, subscriber_id, token_mikrowisp).then(async function (result) {
                                var resultado_json = JSON.parse(result)
                                if (resultado_json.estado == "exito") {
                                    valor_recibo -= valor_factura
                                    contador += 1
                                    indicador_pago_procesado = true
                                    await setCustomField(subscriber_id, field_id, num_factura, token_manychat).then(async function (r) {
                                        await sendFlow_manychat(subscriber_id, flow_ns_pago_parcial, token_manychat).then(function (s) {
                                        });
                                    });
                                } else {
                                    indicador_terminar_loop = true  
                                    respuesta_mikrowisp = result  
                                    await sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                                        resolve(respuesta_mikrowisp);
                                    });                                 
                                }
                            })
                        }
                    } else {
                        if (contador == 0) {
                            indicador_terminar_loop = true
                            await pagar_factura(num_factura, num_comprobante, pasarela, valor_recibo, subscriber_id, token_mikrowisp).then(async function (result) {
                                await sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                                    resolve(result);
                                });
                            })
                        }
                    }
                }
                if (indicador_pago_procesado == true) {
                    console.log(`Pagos procesados: ${contador}`)
                    sendFlow_manychat(subscriber_id, flow_ns_exito, token_manychat).then(function (a) {
                        resolve(`{ "estado": "exito", "mensaje": "Pagos registrados correctamente" }`);
                    });
                }
            })
        } catch (e) {
            resolve(e);
        }
    })
}


const crear_respuesta_recaudaciones_bp = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_recaudaciones = {};
                for (let i = 0; i < resultado.length; i++) {
                    if ((resultado[i].toLowerCase().includes("empres") || resultado[i].toLowerCase().includes("mpresa") || resultado[i].toLowerCase().includes("enpres"))
                        && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_recaudaciones["nombreEmpresa"] = "TURBONET S.A";
                    }
                    if (resultado[i].toLowerCase().includes("valor") || resultado[i].toLowerCase().includes("velor")) {
                        const valorCliente = resultado[i].split(" ").pop();
                        conjunto_recaudaciones["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("control") || resultado[i].toLowerCase().includes("ontrol")) {
                        const controlCliente = resultado[i].split(" ").pop();
                        conjunto_recaudaciones["controlCliente"] = controlCliente.trim();
                    }
                }
                resolve(conjunto_recaudaciones);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1.00)
    })
}

const crear_respuesta_ventanilla_bp = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_ventanilla = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_ventanilla["nombreEmpresa"] = "TURBONET S.A";
                    }
                    if (resultado[i].toLowerCase().includes("efectiv") || resultado[i].toLowerCase().includes("valor") || resultado[i].toLowerCase().includes("cheques")) {
                        if (resultado[i].toLowerCase().includes("cheques")) {
                            indicador_cheque = true;
                        }
                        const valorCliente = resultado[i].split(" ").pop();
                        conjunto_ventanilla["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("documento")) {
                        const controlCliente = resultado[i].split(" ").pop();
                        conjunto_ventanilla["controlCliente"] = controlCliente.trim();
                    }
                }
                resolve(conjunto_ventanilla);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_vecino_bp = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_vecino = {};
                for (let i = 0; i < resultado.length; i++) {
                    if ((resultado[i].toLowerCase().includes("nombre") || resultado[i].toLowerCase().includes("hombre") || resultado[i].toLowerCase().includes("ombre")) && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_vecino["nombreEmpresa"] = "TURBONET S.A";
                    }
                    if (resultado[i].toLowerCase().includes("efectiv") || resultado[i].toLowerCase().includes("fectivo") || resultado[i].toLowerCase().includes("valor") || resultado[i].toLowerCase().includes("cheques")) {
                        if (resultado[i].toLowerCase().includes("cheques")) {
                            indicador_cheque = true;
                        }
                        const valorCliente = resultado[i].split(" ").pop();
                        conjunto_vecino["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("control") || resultado[i].toLowerCase().includes("ontrol")) {
                        const controlCliente = resultado[i].split(" ").pop();
                        conjunto_vecino["controlCliente"] = controlCliente.trim();
                    }
                }
                resolve(conjunto_vecino);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_cajero_bp = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_cajero_bp = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_cajero_bp["nombreEmpresa"] = "TURBONET S.A";
                    }
                    if (resultado[i].toLowerCase().includes("deposito efectivo")) {
                        const valorCliente = resultado[i].split(" ").pop();
                        conjunto_cajero_bp["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("tran:")) {
                        const controlCliente = resultado[i].split(" ").pop();
                        conjunto_cajero_bp["controlCliente"] = controlCliente.trim();
                    }
                }
                resolve(conjunto_cajero_bp);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_bp = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_bp = {};
                for (let i = 0; i < resultado.length; i++) {
                    if ((resultado[i].toLowerCase().includes("beneficiario") && resultado[i].toLowerCase().includes("turbonet") || resultado.includes("TURBONET S.A"))) {
                        conjunto_transferencia_bp["nombreEmpresa"] = "TURBONET S.A";
                    }
                    if ((resultado[i].toLowerCase().includes("has $") || resultado[i].toLowerCase().includes("has transferido $") || resultado[i].toLowerCase().includes("monto"))) {
                        if (resultado[i].includes("USD")) {
                            const valorCliente = resultado[i].split("USD")[1];
                            conjunto_transferencia_bp["valorCliente"] = valorCliente.trim()
                        } else {
                            const valorCliente = resultado[i].split("$")[1];
                            conjunto_transferencia_bp["valorCliente"] = valorCliente.trim()
                        }
                    }
                    if (resultado[i].toLowerCase().includes("nro. comprobante") || resultado[i].toLowerCase().includes("número de documento")) {
                        const controlCliente = resultado[i].split(":")[1];
                        conjunto_transferencia_bp["controlCliente"] = controlCliente.trim();
                    }
                }
                resolve(conjunto_transferencia_bp);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_bp_actualizada = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_actualizada = {};
                for (let i = 0; i < resultado.length; i++) {
                    if ((resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) || resultado.includes("Turbonet S.A") || resultado.includes("Turbonet SA") || resultado.includes("Turbonet S A") || resultado.includes("Turbonet Sa")) {
                        conjunto_transferencia_actualizada["nombreEmpresa"] = "TURBONET S.A";
                    }
                    if ((!resultado[i].toLowerCase().includes("costo de trans") && !resultado[i].toLowerCase().includes("iva") && resultado[i].toLowerCase().includes("$"))) {
                        const valorCliente = resultado[i].split("$")[1];
                        conjunto_transferencia_actualizada["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("comprobante") && !resultado[i].toLowerCase().includes("compartir")) {
                        if (resultado[i].includes(":")) {
                            const controlCliente = resultado[i].split(":")[1];
                            conjunto_transferencia_actualizada["controlCliente"] = controlCliente.trim();
                        } else {
                            const controlCliente = resultado[i].split(" ")[1];
                            conjunto_transferencia_actualizada["controlCliente"] = controlCliente.trim();
                        }
                    }
                }
                resolve(conjunto_transferencia_actualizada);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_directa_bp = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencias_directas_bp = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("documento")) {
                        const controlCliente = resultado[i].split(":")[1];
                        conjunto_transferencias_directas_bp["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("valor")) {
                        const valorCliente = resultado[i].split("$")[1];
                        conjunto_transferencias_directas_bp["valorCliente"] = valorCliente.trim();
                    }
                    if (((resultado[i].toLowerCase().includes("beneficiario") || resultado[i].toLowerCase().includes("para")) && resultado[i].toLowerCase().includes("turbonet"))) {
                        conjunto_transferencias_directas_bp["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencias_directas_bp);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_bg = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_bg = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("no.")) {
                        const controlCliente = resultado[i].split(".")[1];
                        conjunto_transferencia_bg["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("valor debitado")) {
                        const valorCliente = resultado[i].split("$")[1];
                        conjunto_transferencia_bg["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("turbonet") && (resultado[i + 1].toLowerCase().includes("banco guayaquil") || (resultado[i + 1].toLowerCase().includes("banco pichincha")))) {
                        conjunto_transferencia_bg["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_bg);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_2_bg = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_2_bg = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("no.")) {
                        const controlCliente = resultado[i].split(".")[1];
                        conjunto_transferencia_2_bg["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("valor transferido")) {
                        const valorCliente = resultado[i].split("$")[1];
                        conjunto_transferencia_2_bg["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("para") && resultado[i + 1].toLowerCase().includes("turbonet")) {
                        conjunto_transferencia_2_bg["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_2_bg);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_interbancaria_bg = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_interbancaria_bg = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("comprobante no.")) {
                        const controlCliente = resultado[i].split(".")[1];
                        conjunto_transferencia_interbancaria_bg["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("valor transferido")) {
                        const valorCliente = resultado[i].split("$")[1];
                        conjunto_transferencia_interbancaria_bg["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("341xxx0004") || (resultado[i].toLowerCase().includes("titular") && (resultado[i].toLowerCase().includes("turbonet")))) {
                        conjunto_transferencia_interbancaria_bg["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_interbancaria_bg);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_interna_bg = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_interna_bg = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("comprobante no.")) {
                        const controlCliente = resultado[i].split(".")[1];
                        conjunto_transferencia_interna_bg["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("valor transferido")) {
                        const valorCliente = resultado[i].split("$")[1];
                        conjunto_transferencia_interna_bg["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("titular cuenta") || resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_transferencia_interna_bg["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_interna_bg);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_cajero_bg = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_cajero_bg = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("secu:")) {
                        const controlCliente = resultado[i].split("SECU:")[1];
                        conjunto_cajero_bg["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("monto:")) {
                        const valorCliente = resultado[i].split("$")[1];
                        conjunto_cajero_bg["valorCliente"] = valorCliente.trim().replace(",", ".");
                    }
                    if (resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_cajero_bg["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_cajero_bg);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_terceros_bg = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_terceros_bg = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("orden:")) {
                        const controlCliente = resultado[i].split(" ")[1];
                        conjunto_terceros_bg["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("$")) {
                        const valorCliente = resultado[i].split("$")[1];
                        if (valorCliente > 0) {
                            conjunto_terceros_bg["valorCliente"] = valorCliente.trim();
                        }
                    }
                    if (resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_terceros_bg["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_terceros_bg);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_ventanilla_bg = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_ventanilla_bg = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("#")) {
                        var controlCliente = resultado[i].split("#")[1];
                        if(controlCliente == ""){
                            controlCliente = resultado[i+1];
                            conjunto_ventanilla_bg["controlCliente"] = controlCliente.trim();
                        }else{
                            conjunto_ventanilla_bg["controlCliente"] = controlCliente.trim();
                        }                        
                    }
                    if (resultado[i].toLowerCase().includes("moneda origen")) {
                        for (var index = 0; index < 4; i++) {
                            var valor = resultado[i + 1][0];
                            if (valor != "0") {
                                if (index == 0) {
                                    var valorCliente = resultado[i + 1].split(" ")[0];
                                    conjunto_ventanilla_bg["valorCliente"] = valorCliente.trim();
                                    break;
                                } else {
                                    var valorCliente = resultado[i + 1].split(" ")[0];
                                    indicador_cheque = true;
                                    conjunto_ventanilla_bg["valorCliente"] = valorCliente.trim();
                                    break;
                                }
                            }
                        }
                    }
                    if (resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_ventanilla_bg["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_ventanilla_bg);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_boliv = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_boliv = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("código de")) {
                        const controlCliente = resultado[i].split(" ").pop();
                        conjunto_transferencia_boliv["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("monto")) {
                        const valorCliente = resultado[i].split("$").pop();
                        conjunto_transferencia_boliv["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_transferencia_boliv["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_boliv);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_terceros_boliv = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_terceros_boliv = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("referencia")) {
                        const controlCliente = resultado[i].split(" ")[1];
                        conjunto_transferencia_terceros_boliv["controlCliente"] = controlCliente.trim();
                    }
                    if (!resultado[i].toLowerCase().includes("cargo por servicio") && resultado[i].toLowerCase().includes("usd")) {
                        const valorCliente = resultado[i].split(" ");
                        valorCliente.forEach(element => {
                            if (parseInt(element) > 0) {
                                conjunto_transferencia_terceros_boliv["valorCliente"] = element.trim();
                            }
                        });
                    }
                    if (resultado[i].toLowerCase().includes("beneficiario") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_transferencia_terceros_boliv["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_terceros_boliv);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_interbancaria_jep = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_interbancaria_jep = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("#")) {
                        const controlCliente = resultado[i].split('#')[1];
                        conjunto_transferencia_interbancaria_jep["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("valor:")) {
                        const valorCliente = resultado[i].split(" ")[1];
                        conjunto_transferencia_interbancaria_jep["valorCliente"] = valorCliente.trim().split("$")[1];
                    }
                    if (resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_transferencia_interbancaria_jep["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_interbancaria_jep);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_jep = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_transferencia_jep = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("comprobante n")) {
                        const controlCliente = resultado[i].split(" ").pop();
                        conjunto_transferencia_jep["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("monto")) {
                        const valorCliente = resultado[i].split(" ")[1];
                        conjunto_transferencia_jep["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("nombre") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_transferencia_jep["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_transferencia_jep);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_cajero_jep = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_cajero_jep = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("referencia")) {
                        const controlCliente = resultado[i].split(' ')[1];
                        conjunto_cajero_jep["controlCliente"] = controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("lote")) {
                        const controlCliente = resultado[i].split(' ')[2];
                        conjunto_cajero_jep["controlCliente"] += controlCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("depositado")) {
                        const valorCliente = resultado[i].split("USD")[1];
                        conjunto_cajero_jep["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("cliente") || resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_cajero_jep["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_cajero_jep);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const crear_respuesta_transferencia_interbancaria_pacifico = (resultado) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                var conjunto_cajero_jep = {};
                for (let i = 0; i < resultado.length; i++) {
                    if (resultado[i].toLowerCase().includes("nut")) {
                        const controlCliente = resultado[i].split(' ')[1];
                        if (controlCliente != undefined) {
                            conjunto_cajero_jep["controlCliente"] = controlCliente.trim();
                        } else {
                            const controlCliente = resultado[i + 1];
                            conjunto_cajero_jep["controlCliente"] = controlCliente.trim();
                        }
                    }
                    if (resultado[i].toLowerCase().includes("valor de")) {
                        const valorCliente = resultado[i].split(" ")[3];
                        conjunto_cajero_jep["valorCliente"] = valorCliente.trim();
                    }
                    if (resultado[i].toLowerCase().includes("perteneciente a") && resultado[i].toLowerCase().includes("turbonet")) {
                        conjunto_cajero_jep["nombreEmpresa"] = "TURBONET S.A";
                    }
                }
                resolve(conjunto_cajero_jep);
            } catch (e) {
                console.log(e);
                resolve({});
            }
        }, 1000)
    })
}

const contraste = (url) => {
    return new Promise((resolve, reject) => {
        try {
            const image = Jimp.read(url);
            image.then((response) => {
                response.contrast(-0.5);
                response.brightness(.4);
                response.getBuffer(Jimp.MIME_JPEG, (err, buffer) => {
                    resolve(buffer);
                });
            })
        } catch (error) {
            reject(error);
        }
    })
}

const extraerTexto = (imagen, token_manychat, subscriber_id, flow_ns_exito, flow_ns_denegado, token_mikrowisp, id_cliente, flow_ns_pago_parcial, field_id) => {
    return new Promise((resolve, reject) => {
        const client = new vision.ImageAnnotatorClient({
            keyFilename: './APIKey.json'
        });
        client.textDetection(imagen).then(results => {
            const textAnnotation = results[0].textAnnotations;
            const full_text_annotation = results[0].fullTextAnnotation;
            const json_final = `[{"textAnnotations": ${JSON.stringify(textAnnotation)}, "fullTextAnnotation": ${JSON.stringify(full_text_annotation)}}]`;
            const text = JSON.parse(json_final);
            const resultado = resource.initLineSegmentation(text[0]);
            console.log(resultado);

            if (resultado.includes("RECAUDACIONES")) {
                console.log("RECAUDACIONES");
                crear_respuesta_recaudaciones_bp(resultado).then(function (respuesta_recaudaciones_bp) {
                    console.log("Respuesta conjunto: ", respuesta_recaudaciones_bp);
                    if (Object.keys(respuesta_recaudaciones_bp).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_recaudaciones_bp.controlCliente, "-DEPOSITO_RECAUD_PCH", respuesta_recaudaciones_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });;
                    }
                });
            } else if (resultado.includes("Cuentas Corrientes") || resultado.includes("Depósito")) {
                console.log("BP Ventanilla");
                crear_respuesta_ventanilla_bp(resultado).then(function (respuesta_ventanilla_bp) {
                    console.log("Respuesta conjunto: ", respuesta_ventanilla_bp);
                    if (Object.keys(respuesta_ventanilla_bp).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_ventanilla_bp.controlCliente, "-DEPOSITO_VENTANILLA_PCH", respuesta_ventanilla_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("CUENTA CORRIENTE") && (resultado.includes("DEPÓSITO") || resultado.includes("DEPOSITO"))) {
                console.log("BP Vecino");
                crear_respuesta_vecino_bp(resultado).then(function (respuesta_vecino_bp) {
                    console.log("Respuesta conjunto: ", respuesta_vecino_bp);
                    if (Object.keys(respuesta_vecino_bp).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_vecino_bp.controlCliente, "-DEPOSITO_VECINO_PCH", respuesta_vecino_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("BANCO PICHINCHA") && resultado.includes("DESCRIPCION VALOR")) {
                console.log("CAJERO BP");
                crear_respuesta_cajero_bp(resultado).then(function (respuesta_cajero_bp) {
                    console.log("Respuesta conjunto: ", respuesta_cajero_bp);
                    if (Object.keys(respuesta_cajero_bp).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_cajero_bp.controlCliente, "-DEPOSITO_CAJERO_PCH", respuesta_cajero_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Transferencia exitosa")) {
                console.log("TRANSF BP");
                crear_respuesta_transferencia_bp(resultado).then(function (respuesta_transferencia_bp) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_bp);
                    if (Object.keys(respuesta_transferencia_bp).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_bp.controlCliente, "-TRANSF_PCH", respuesta_transferencia_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Detalle") && resultado.includes("Transferencia")) {
                console.log("TRANSF BP");
                crear_respuesta_transferencia_bp(resultado).then(function (respuesta_transferencia_bp) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_bp);
                    if (Object.keys(respuesta_transferencia_bp).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_bp.controlCliente, "-TRANSF_PCH", respuesta_transferencia_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if ((resultado.includes("¡Transacción exitosa!") || resultado.includes("¡Transferencia enviada!") || resultado.includes("¡Transferencia exitosa!") || resultado.includes("lTransferencia exitosal") || resultado.includes("¡Transferencia exitosal") || resultado.includes("VERSIÓN GRATUITA de RAWBT.APP") || resultado.includes("La aplicación RawBT es")) && resultado.includes("Cuenta origen") && resultado.includes("Cuenta destino")) {
                console.log("TRANSF BPA");
                crear_respuesta_transferencia_bp_actualizada(resultado).then(function (respuesta_transferencia_bp_actualizada) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_bp_actualizada);
                    if (Object.keys(respuesta_transferencia_bp_actualizada).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_bp_actualizada.controlCliente, "-TRANSF_PCH", respuesta_transferencia_bp_actualizada.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if ((resultado.includes("Transferencias Directas") || resultado.includes("TRANSFERENCIA DIRECTA")) && resultado.includes("Detalle")) {
                console.log("TRANSF DIRECTAS BP");
                crear_respuesta_transferencia_directa_bp(resultado).then(function (respuesta_transferencias_directas_bp) {
                    console.log("Respuesta conjunto: ", respuesta_transferencias_directas_bp);
                    if (Object.keys(respuesta_transferencias_directas_bp).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencias_directas_bp.controlCliente, "-TRANSF_DIRECTA_PCH", respuesta_transferencias_directas_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if ((resultado.includes("TURBONET") || resultado.includes("Turbonet") || resultado.includes("Turbonet S A") || resultado.includes("Turbonet SA") || resultado.includes("Turbonet Sa") || resultado.includes("Turbonet S a")) && (resultado.includes("Transferencia interna otras ctas") || resultado.includes("TRANSFERENCIA INTERNA OTRAS CTAS") || resultado.includes("TRANSFERENCIA INTERNA OTRAS") || resultado.includes("Transferencia a otras instituciones financieras") || resultado.includes("Transferencia a otras instituciones") || resultado.includes("Banco Guayaquil Corriente -") || resultado.includes("Banco Guayaquil Corriente - 3XXX8493"))) {
                console.log("TRANSF BG");
                crear_respuesta_transferencia_bg(resultado).then(function (respuesta_transferencia_bg) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_bg);
                    if (Object.keys(respuesta_transferencia_bg).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_bg.controlCliente, "-TRANSF_GYE", respuesta_transferencia_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Referencia Valor") && resultado.includes("Detalle:")) {
                console.log("TRANSF BG");
                crear_respuesta_transferencia_2_bg(resultado).then(function (respuesta_transferencia_2_bg) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_2_bg);
                    if (Object.keys(respuesta_transferencia_2_bg).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_2_bg.controlCliente, "-TRANSF_GYE", respuesta_transferencia_2_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Banca Móvil Personas") && resultado.includes("Datos del Ordenante")) {
                console.log("TRANSF INTERNA BG");
                crear_respuesta_transferencia_interna_bg(resultado).then(function (respuesta_transferencia_interna_bg) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_interna_bg);
                    if (Object.keys(respuesta_transferencia_interna_bg).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_interna_bg.controlCliente, "-TRANSF_INTERNA_GYE", respuesta_transferencia_interna_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Banca Virtual") && resultado.includes("Datos del Ordenante")) {
                console.log("TRANSF INTERBANCARIA BG");
                crear_respuesta_transferencia_interbancaria_bg(resultado).then(function (respuesta_transferencia_interbancaria_bg) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_interbancaria_bg);
                    if (Object.keys(respuesta_transferencia_interbancaria_bg).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_interbancaria_bg.controlCliente, "-TRANSF_INTERBAN_GYE", respuesta_transferencia_interbancaria_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("BANCO GUAYAQUIL") && resultado.includes("TRANSACCION: DEPOSITO")) {
                console.log("CAJERO GYE");
                crear_respuesta_cajero_bg(resultado).then(function (respuesta_cajero_bg) {
                    console.log("Respuesta conjunto: ", respuesta_cajero_bg);
                    if (Object.keys(respuesta_cajero_bg).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_cajero_bg.controlCliente, "-CAJERO_GYE", respuesta_cajero_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("COMPROBANTE DE TRANSACCION")) {
                console.log("DEPOSITO VENTANILLA GYE");
                crear_respuesta_ventanilla_bg(resultado).then(function (respuesta_ventanilla_bg) {
                    console.log("Respuesta conjunto: ", respuesta_ventanilla_bg);
                    if (Object.keys(respuesta_ventanilla_bg).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_ventanilla_bg.controlCliente, "-VENTANILLA_GYE", respuesta_ventanilla_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("BANCO GUAYAQUIL") && resultado.includes("Estado: PROCESADO")) {
                console.log("PAGO A TERCEROS GYE");
                crear_respuesta_terceros_bg(resultado).then(function (respuesta_terceros_bg) {
                    console.log("Respuesta conjunto: ", respuesta_terceros_bg);
                    if (Object.keys(respuesta_terceros_bg).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_terceros_bg.controlCliente, "-PAGO_TERCEROS _GYE", respuesta_terceros_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Operación Terminada Exitosamente") && resultado.includes("Beneficiario") || resultado.includes("Operación Terminada Exitosamente")) {
                console.log("TRANSF BOLIVARIANO");
                crear_respuesta_transferencia_boliv(resultado).then(function (respuesta_transferencia_boliv) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_boliv);
                    if (Object.keys(respuesta_transferencia_boliv).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_boliv.controlCliente, "-TRANSF_BOLIV", respuesta_transferencia_boliv.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Comprobante de transferencia a cuenta de terceros")) {
                console.log("TRANSF TERCEROS BOLIVARIANO");
                crear_respuesta_transferencia_terceros_boliv(resultado).then(function (respuesta_transferencia_terceros_boliv) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_terceros_boliv);
                    if (Object.keys(respuesta_transferencia_terceros_boliv).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_terceros_boliv.controlCliente, "-TRANSF_TERCEROS_BOLIV", respuesta_transferencia_terceros_boliv.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Ordenante Beneficiario")) {
                console.log("TRANSF INTERBANCARIA JEP");
                crear_respuesta_transferencia_interbancaria_jep(resultado).then(function (respuesta_transferencia_interbancaria_jep) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_interbancaria_jep);
                    if (Object.keys(respuesta_transferencia_interbancaria_jep).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_interbancaria_jep.controlCliente, "-TRANSF_INTERBANC_JEP", respuesta_transferencia_interbancaria_jep.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("COMPROBANTE DE TRANSFERENCIA") && resultado.includes("Entidad COOPERATIVA JEP")) {
                console.log("TRANSF BANCARIA JEP");
                crear_respuesta_transferencia_jep(resultado).then(function (respuesta_transferencia_jep) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_jep);
                    if (Object.keys(respuesta_transferencia_jep).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_jep.controlCliente, "-TRANSF_JEP", respuesta_transferencia_jep.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("JUVENTUD ECUATORIANA PROGRESISTA") && resultado.includes("COOPERATIVA")) {
                console.log("DEPOSITO CAJERO JEP");
                crear_respuesta_cajero_jep(resultado).then(function (respuesta_cajero_jep) {
                    console.log("Respuesta conjunto: ", respuesta_cajero_jep);
                    if (Object.keys(respuesta_cajero_jep).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_cajero_jep.controlCliente, "-CAJERO_JEP", respuesta_cajero_jep.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else if (resultado.includes("Transferencias interbancarias") && resultado.includes("Perteneciente a TURBONET SA")) {
                console.log("TRANSF INTERBANCARIA PACIFICO");
                crear_respuesta_transferencia_interbancaria_pacifico(resultado).then(function (respuesta_transferencia_interbancaria_pacifico) {
                    console.log("Respuesta conjunto: ", respuesta_transferencia_interbancaria_pacifico);
                    if (Object.keys(respuesta_transferencia_interbancaria_pacifico).length != 3) {
                        sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                            resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                        });
                    } else {
                        pagar_facturas(id_cliente, respuesta_transferencia_interbancaria_pacifico.controlCliente, "-TRANSF_INTERB_PACIFICO", respuesta_transferencia_interbancaria_pacifico.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                            resolve(resultado);
                        });
                    }
                });
            } else {
                var indicador = false;
                for (var index = 0; index < resultado.length; index++) {
                    if (resultado[index].includes("DEPOSITO CUENTA CORRIENTE")) {
                        console.log("DEPOSITO VENTANILLA GYE");
                        crear_respuesta_ventanilla_bg(resultado).then(function (respuesta_ventanilla_bg) {
                            console.log("Respuesta conjunto: ", respuesta_ventanilla_bg);
                            if (Object.keys(respuesta_ventanilla_bg).length != 3) {
                                sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                                    resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                                });
                            } else {
                                pagar_facturas(id_cliente, respuesta_ventanilla_bg.controlCliente, "-VENTANILLA_GYE", respuesta_ventanilla_bg.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                                    resolve(resultado);
                                });
                            }
                        });
                        indicador = true;
                        break;
                    } else if (resultado[index].includes("RECAUDACIONES")) {
                        console.log("RECAUDACIONES");
                        crear_respuesta_recaudaciones_bp(resultado).then(function (respuesta_recaudaciones_bp) {
                            console.log("Respuesta conjunto: ", respuesta_recaudaciones_bp);
                            if (Object.keys(respuesta_recaudaciones_bp).length != 3) {
                                sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                                    resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                                });
                            } else {
                                pagar_facturas(id_cliente, respuesta_recaudaciones_bp.controlCliente, "-DEPOSITO_RECAUDACIONES_PCH", respuesta_recaudaciones_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                                    resolve(resultado);
                                });;
                            }
                        });
                        indicador = true;
                        break;
                    } else if (resultado[index].includes("**GUARDE SU RECIBO**")) {
                        console.log("BP VECINO");
                        crear_respuesta_vecino_bp(resultado).then(function (respuesta_vecino_bp) {
                            console.log("Respuesta conjunto: ", respuesta_vecino_bp);
                            if (Object.keys(respuesta_vecino_bp).length != 3) {
                                sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(function (r) {
                                    resolve(`{"estado": 0, "mensaje": "Hay campos que no se han identificado correctamente"}`);
                                });
                            } else {
                                pagar_facturas(id_cliente, respuesta_vecino_bp.controlCliente, "-DEPOSITO_VECINO_PCH", respuesta_vecino_bp.valorCliente, subscriber_id, flow_ns_exito, flow_ns_denegado, token_manychat, token_mikrowisp, flow_ns_pago_parcial, field_id).then(function (resultado) {
                                    resolve(resultado);
                                });
                            }
                        });
                        indicador = true;
                        break;
                    }
                }
                if (indicador == false) {
                    console.log("NO CORRESPONDE A RECIBO");
                    sendFlow_manychat(subscriber_id, flow_ns_denegado, token_manychat).then(async function (r) {
                        resolve(`{"estado": 0, "mensaje": "El recibo no ha sido identificado"}`);
                    });
                }
            }
        }
        )
    });
}

const functions = require('@google-cloud/functions-framework');
functions.http('handler', (req, res) => {
    const body = req.body;
    try {
        contraste(body.url_imagen).then(function (imagenContrastada) {
            extraerTexto(imagenContrastada, body.token_manychat, body.subscriber_id, body.flow_ns_exito, body.flow_ns_denegado, body.token_mikrowisp, body.id_cliente, body.flow_ns_pago_parcial, body.field_id).then(function (resultado) {
                var final_result = JSON.parse(resultado);
                if (final_result.mensaje == undefined) {
                    res.status(200).send({ "resultado": final_result.salida, "indicador_cheque": indicador_cheque.toString() });
                } else {
                    res.status(200).send({ "resultado": final_result.mensaje, "indicador_cheque": indicador_cheque.toString() });
                }
            });
        });
    }
    catch (e) {
        sendFlow_manychat(body.subscriber_id, body.flow_ns_denegado, body.token_manychat).then(function (resultado) {
            res.status(200).send({ "estado": "error", "mensaje": "Ha ocurrido un error procesando el pago" });
        });
    }
});