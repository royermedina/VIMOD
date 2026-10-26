const ProjectService = require('../Proyectos');
const { WorkflowContext } = ProjectService;
const OrderPaymentService = require('./order-payment-service');
const { ProposalWorkflowService } = require('../Propuestas');
const ReviewService = require('../Revisiones');
const { ServiceCatalogService } = require('../Servicios');
const QuoteService = require('../Cotizaciones');
const PaymentSimulator = require('./payment-simulator');
const StripePaymentService = require('./stripe-payment-service');

const workflowModules = [
  ProposalWorkflowService,
  ReviewService,
  ServiceCatalogService,
  QuoteService,
  OrderPaymentService,
];

class WorkflowService extends WorkflowContext {
  constructor(paymentSimulator, stripePaymentService) {
    super(
      paymentSimulator === undefined ? new PaymentSimulator() : paymentSimulator,
      stripePaymentService === undefined ? new StripePaymentService() : stripePaymentService,
    );
    for (const Module of workflowModules) {
      for (const name of Object.getOwnPropertyNames(Module.prototype)) {
        if (name !== 'constructor') this[name] = Module.prototype[name].bind(this);
      }
    }
  }
}

module.exports = { WorkflowService, PaymentSimulator, StripePaymentService };
