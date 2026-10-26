const crypto = require('crypto');
const { HttpError } = require('../../../Nucleo');

const METHODS = new Map([
  ['test_card', 'Tarjeta de prueba'],
  ['simulated_transfer', 'Transferencia simulada'],
  ['test_balance', 'Saldo de prueba'],
]);

const RESULTS = new Set(['approved', 'declined', 'cancelled', 'pending']);

class PaymentSimulator {
  constructor() {
    this.provider = 'internal_simulation';
    this.simulated = true;
  }

  isConfigured() {
    return true;
  }

  createReference(orderId) {
    return `vimod_sim_${orderId}_${crypto.randomBytes(8).toString('hex')}`;
  }

  amountInCop(amount) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new HttpError(409, 'El importe de la orden no es válido para la simulación');
    }
    return numericAmount;
  }

  validateMethod(method) {
    if (!METHODS.has(method)) throw new HttpError(400, 'El método de pago simulado no es válido');
    return method;
  }

  validateResult(result) {
    if (!RESULTS.has(result)) throw new HttpError(400, 'El resultado simulado no es válido');
    return result;
  }

  createSimulationSession({ orderId, paymentId, amount, currency, reference }) {
    if (currency !== 'COP') throw new HttpError(409, 'La simulación solo admite órdenes en COP');
    const amountInCop = this.amountInCop(amount);
    return {
      provider: this.provider,
      simulated: true,
      orderId,
      paymentId,
      reference: reference || this.createReference(orderId),
      amount: amountInCop,
      currency: 'COP',
      methods: [...METHODS].map(([value, label]) => ({ value, label })),
      results: [
        { value: 'approved', label: 'Aprobado' },
        { value: 'declined', label: 'Rechazado' },
        { value: 'cancelled', label: 'Cancelado por el usuario' },
        { value: 'pending', label: 'Pendiente' },
      ],
      disclaimer: 'Simulación académica interna. No se realiza ningún cobro real.',
    };
  }
}

module.exports = PaymentSimulator;
