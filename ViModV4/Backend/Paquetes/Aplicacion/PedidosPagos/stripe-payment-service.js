const Stripe = require('stripe');
const { HttpError, getRuntimeConfig } = require('../../../Nucleo');
const { PaymentRepository } = require('../../Persistencia/Repositorios');
const { ContractedProjectService } = require('../Proyectos');
const {
  convertCopToUsdCents,
  RETRYABLE_ORDER_STATUSES,
} = require('../../Dominio/ModeloPagos');

const MIN_USD_CENTS = 50;
const MAX_USD_CENTS = 99999999;

class StripePaymentService {
  constructor({
    client,
    clientFactory,
    repository,
    contractedProjectService,
    config,
  } = {}) {
    this.client = client || null;
    this.clientFactory = clientFactory || ((key) => new Stripe(key));
    this.repository = repository || new PaymentRepository();
    this.contractedProjectService = contractedProjectService || new ContractedProjectService();
    const env = config ? null : getRuntimeConfig();
    this.config = config || {
      provider: env.paymentProvider,
      secretKey: env.stripeSecretKey,
      copPerUsd: env.copPerUsd,
      frontendUrl: env.frontendUrl,
      stripeReturnUrls: env.stripeReturnUrls,
    };
  }

  isEnabled() {
    return this.config.provider === 'stripe' && Boolean(this.config.secretKey);
  }

  stripeClient() {
    if (!this.config.secretKey.startsWith('sk_test_')) {
      throw new HttpError(503, 'Stripe requiere una clave de prueba que empiece por sk_test_. No se aceptan claves live.');
    }
    if (!this.client) this.client = this.clientFactory(this.config.secretKey);
    return this.client;
  }

  convertAmount(amountCop) {
    const copPerUsd = Number(this.config.copPerUsd);
    if (!Number.isFinite(copPerUsd) || copPerUsd <= 0) {
      throw new HttpError(503, 'COP_PER_USD debe ser una tasa positiva para habilitar Stripe.');
    }
    const amountUsdCents = convertCopToUsdCents(amountCop, copPerUsd);
    if (!Number.isSafeInteger(amountUsdCents)
      || amountUsdCents < MIN_USD_CENTS
      || amountUsdCents > MAX_USD_CENTS) {
      throw new HttpError(
        400,
        `El monto convertido está fuera del rango de Stripe para USD (mínimo 0,50 USD; máximo 999.999,99 USD).`,
      );
    }
    return { amountCop: Number(amountCop), amountUsdCents, copPerUsd };
  }

  async createCheckoutSession(ownerId, orderId) {
    const client = this.stripeClient();
    const order = await this.repository.findOrderForOwner(orderId, ownerId);
    if (!order) throw new HttpError(404, 'Pedido no encontrado');
    if (order.currency !== 'COP' || !Number.isFinite(Number(order.amount)) || order.amount <= 0) {
      throw new HttpError(409, 'El pedido debe tener un total válido en COP para pagar con Stripe.');
    }
    if (!RETRYABLE_ORDER_STATUSES.includes(order.orderStatus)) {
      throw new HttpError(409, 'El pedido no está disponible para iniciar el pago');
    }
    const converted = this.convertAmount(order.amount);
    const payment = await this.repository.ensurePayment(order);
    if (payment.status === 'approved') throw new HttpError(409, 'El pedido ya tiene un pago aprobado.');
    const proposalName = await this.repository.findProposalName(order);
    const itemName = proposalName || 'Pedido ViMod';
    const { successUrl, cancelUrl } = this.config.stripeReturnUrls(this.config.frontendUrl, order);

    const session = await client.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: converted.amountUsdCents,
          product_data: { name: itemName },
        },
      }],
      metadata: {
        orderId: order._id.toHexString(),
        paymentId: payment._id.toHexString(),
        userId: order.ownerId.toHexString(),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    if (!session || !session.id || !session.url) {
      throw new HttpError(502, 'Stripe no devolvió una sesión de pago válida.');
    }
    const savedPayment = await this.repository.saveStripeSession(payment, order, {
      stripeSessionId: session.id,
      url: session.url,
      ...converted,
    });
    if (!savedPayment) throw new HttpError(409, 'El pago del pedido cambió; vuelve a intentarlo.');
    return {
      provider: 'stripe',
      url: session.url,
      orderId: order._id.toHexString(),
      paymentId: payment._id.toHexString(),
      amountCop: converted.amountCop,
      amountUsdCents: converted.amountUsdCents,
      copPerUsd: converted.copPerUsd,
      currency: 'USD',
    };
  }

  async confirmSession(ownerId, sessionId) {
    if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      throw new HttpError(400, 'sessionId de Stripe no válido.');
    }
    const payment = await this.repository.findPaymentByStripeSession(sessionId);
    if (!payment || payment.ownerId.toHexString() !== ownerId) {
      throw new HttpError(404, 'Sesión de pago no encontrada.');
    }
    const session = await this.stripeClient().checkout.sessions.retrieve(sessionId);
    if (!session.metadata
      || session.metadata.orderId !== payment.orderId.toHexString()
      || session.metadata.paymentId !== payment._id.toHexString()
      || session.metadata.userId !== ownerId) {
      throw new HttpError(403, 'Los datos de la sesión de Stripe no coinciden con el pedido autenticado.');
    }
    if (session.payment_status === 'paid') {
      if (session.currency !== 'usd' || session.amount_total !== payment.amountUsdCents) {
        throw new HttpError(403, 'El importe o la moneda de la sesión de Stripe no coincide con el pago.');
      }
      const updated = await this.repository.markStripeResult(payment, 'paid');
      if (!updated) throw new HttpError(409, 'No se pudo actualizar el estado del pago.');
      await this.contractedProjectService.finalizePaidOrder(
        payment.orderId.toHexString(),
        updated._id.toHexString(),
        'stripe',
        new Date(),
      );
      return { status: 'approved', orderStatus: 'paid', paymentId: updated._id.toHexString() };
    }
    if (session.status === 'expired') {
      await this.repository.markStripeResult(payment, 'expired');
      return { status: 'expired', orderStatus: 'payment_expired', paymentId: payment._id.toHexString() };
    }
    await this.repository.markStripePending(payment);
    return { status: 'pending', orderStatus: 'payment_pending', paymentId: payment._id.toHexString() };
  }

  async cancelSession(ownerId, orderId) {
    const order = await this.repository.getOrderById(orderId, ownerId);
    if (!order) throw new HttpError(404, 'Pedido no encontrado.');
    const payment = await this.repository.findPaymentByOrder(order._id.toHexString());
    if (!payment || payment.provider !== 'stripe') {
      throw new HttpError(404, 'No se encontró un pago de Stripe pendiente para el pedido.');
    }
    if (payment.status === 'approved') throw new HttpError(409, 'El pedido ya tiene un pago aprobado.');
    if (payment.stripeSessionId) {
      const session = await this.stripeClient().checkout.sessions.retrieve(payment.stripeSessionId);
      if (session.payment_status === 'paid') {
        if (session.currency !== 'usd' || session.amount_total !== payment.amountUsdCents) {
          throw new HttpError(403, 'El importe o la moneda de la sesión de Stripe no coincide con el pago.');
        }
        await this.repository.markStripeResult(payment, 'paid');
        await this.contractedProjectService.finalizePaidOrder(
          payment.orderId.toHexString(),
          payment._id.toHexString(),
          'stripe',
          new Date(),
        );
        return { status: 'approved', orderStatus: 'paid' };
      }
      if (session.status === 'expired') {
        await this.repository.markStripeResult(payment, 'expired');
        return { status: 'expired', orderStatus: 'payment_expired' };
      }
      if (session.status === 'open') {
        await this.stripeClient().checkout.sessions.expire(payment.stripeSessionId);
      }
    }
    const cancelledPayment = await this.repository.markOrderCancellation(payment, order);
    if (cancelledPayment && cancelledPayment.status === 'approved') {
      return { status: 'approved', orderStatus: 'paid' };
    }
    return { status: 'cancelled', orderStatus: 'payment_cancelled' };
  }
}

StripePaymentService.MIN_USD_CENTS = MIN_USD_CENTS;
StripePaymentService.MAX_USD_CENTS = MAX_USD_CENTS;
module.exports = StripePaymentService;
