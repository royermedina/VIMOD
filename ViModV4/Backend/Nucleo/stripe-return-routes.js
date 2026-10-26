const STRIPE_RETURN_PAGES = Object.freeze({
  proposal: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/8.%20Detalles%20Propuestas.html',
  offer: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/7.%20Propuestas%20Generadas.html',
});

function stripeReturnUrls(frontendUrl, order) {
  const origin = new URL(frontendUrl).origin;
  const returnPage = order.offerId ? STRIPE_RETURN_PAGES.offer : STRIPE_RETURN_PAGES.proposal;
  const parameters = new URLSearchParams({ proyecto: order.projectId.toHexString() });
  if (order.proposalId) parameters.set('propuesta', order.proposalId.toHexString());
  const returnUrl = `${origin}${returnPage}?${parameters.toString()}`;

  return {
    successUrl: `${returnUrl}&pago=exito&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${returnUrl}&pago=cancelado&orden_id=${encodeURIComponent(order._id.toHexString())}`,
  };
}

module.exports = { STRIPE_RETURN_PAGES, stripeReturnUrls };
