const { ObjectId } = require('mongodb');
const {
  HttpError,
  objectId,
  clean,
} = require('../../../Nucleo');
const { resolveRole } = require('../Autenticacion');
const { isReviewEligible } = require('../../Dominio/ModeloRevisiones');

class ReviewService {
  async reserveReviewSlot(project, reviewId) {
    const result = await this.projectRepository.reserveReview(project._id, project.ownerId, reviewId);
    if (!result.modifiedCount) throw new HttpError(409, 'Ya existe una solicitud de revisión activa');
  }

  async releaseReviewSlot(review) {
    await this.projectRepository.releaseReview(review.projectId, review.ownerId, review._id);
  }

  async approvedArchitect(architectId) {
    const architect = await this.userRepository.findDocumentById(objectId(architectId, 'Arquitecto'));
    const accountStatus = String(architect && architect.accountStatus || '').toLowerCase();
    if (!architect || resolveRole(architect) !== 'arquitecto'
      || !['aprobado', 'approved', 'active', 'activo'].includes(accountStatus)) {
      throw new HttpError(403, 'La cuenta no es un arquitecto aprobado y activo');
    }
    return architect;
  }

  async architectProfile(architectId) {
    const architect = await this.approvedArchitect(architectId);
    return this.architectSummary(architect);
  }

  async updateArchitectProfile(architectId, data) {
    const architect = await this.approvedArchitect(architectId);
    const name = typeof data.nombre === 'string' ? data.nombre.trim() : architect.nombre;
    if (!name || name.length > 120) {
      throw new HttpError(400, 'El nombre debe tener entre 1 y 120 caracteres');
    }
    const current = architect.architectProfile || {};
    const specialty = data.especialidad === undefined
      ? current.specialty || ''
      : typeof data.especialidad === 'string' ? data.especialidad.trim() : '';
    const zone = data.zona === undefined
      ? current.zone || ''
      : typeof data.zona === 'string' ? data.zona.trim() : '';
    if (specialty.length > 120 || zone.length > 120) {
      throw new HttpError(400, 'Especialidad y zona deben tener como máximo 120 caracteres');
    }
    const years = data.anosExperiencia === undefined
      ? current.yearsExperience ?? null
      : data.anosExperiencia === '' || data.anosExperiencia === null
        ? null : Number(data.anosExperiencia);
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 80)) {
      throw new HttpError(400, 'Los años de experiencia deben ser un entero de 0 a 80');
    }
    const baseFee = data.honorarioBase === undefined
      ? current.baseFee ?? null
      : data.honorarioBase === '' || data.honorarioBase === null
        ? null : Number(data.honorarioBase);
    if (baseFee !== null && (!Number.isFinite(baseFee) || baseFee < 0)) {
      throw new HttpError(400, 'El honorario base debe ser cero o mayor');
    }
    const updated = await this.userRepository.updateArchitectProfile(architectId, {
      nombre: name,
      architectProfile: {
        specialty,
        yearsExperience: years,
        zone,
        baseFee,
      },
      updatedAt: new Date(),
    });
    return this.architectSummary(updated);
  }

  async listApprovedArchitects() {
    const activeAccounts = await this.userRepository.findActiveAccounts();
    const architects = activeAccounts.filter((architect) =>
      resolveRole(architect) === 'arquitecto'
      && ['aprobado', 'approved', 'active', 'activo'].includes(
        String(architect.accountStatus || '').toLowerCase(),
      ));
    return Promise.all(architects.map((architect) => this.architectSummary(architect)));
  }

  async architectSummary(architect) {
    const profile = architect.architectProfile || {};
    const rating = await this.reviewRequestRepository.averageRatingForArchitect(architect._id);
    return {
      id: architect._id.toHexString(),
      nombre: architect.nombre || null,
      especialidad: profile.specialty || null,
      anosExperiencia: profile.yearsExperience ?? null,
      zona: profile.zone || null,
      honorarioBase: profile.baseFee ?? null,
      ratingAverage: rating ? Math.round(rating.average * 100) / 100 : null,
      ratingCount: rating ? rating.count : 0,
      demo: Boolean(architect.demo),
      recordOrigin: architect.demo ? 'demo' : 'administrative',
    };
  }

  async requestReview(ownerId, projectId, data = {}) {
    const project = await this.ownedProject(projectId, ownerId);
    const paymentState = await this.contractedProjectService.getPaymentState(project._id, project.ownerId);
    const selectedId = data.proposalId
      || (paymentState.paid && paymentState.proposalId)
      || project.selectedProposalId;
    if (!isReviewEligible(project, paymentState)) {
      throw new HttpError(400, 'Selecciona una propuesta antes de solicitar revisión');
    }
    if (paymentState.paid && paymentState.proposalId
      && String(selectedId) !== paymentState.proposalId) {
      throw new HttpError(409, 'La revisión debe basarse en la propuesta contratada');
    }
    const selectedObjectId = selectedId instanceof ObjectId
      ? selectedId
      : objectId(selectedId, 'Propuesta');
    const proposal = await this.proposalRepository.findReviewable(
      selectedObjectId,
      project._id,
      project.ownerId,
    );
    if (!proposal) throw new HttpError(404, 'Propuesta no disponible para este proyecto');
    const active = await this.reviewRequestRepository.findActiveForProject(project._id, project.ownerId);
    if (active) throw new HttpError(409, 'Ya existe una solicitud de revisión activa');

    const mode = data.mode || 'open';
    if (mode !== 'open' && mode !== 'directed') {
      throw new HttpError(400, 'La modalidad debe ser open o directed');
    }
    const architect = mode === 'directed'
      ? await this.approvedArchitect(data.architectId)
      : null;
    const now = new Date();
    const document = {
      _id: new ObjectId(),
      projectId: project._id,
      ownerId: project.ownerId,
      proposalId: proposal._id,
      architectId: architect ? architect._id : null,
      mode,
      applications: [],
      status: mode,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.reserveReviewSlot(project, document._id);
    try {
      await this.reviewRequestRepository.create(document);
    } catch (error) {
      await this.projectRepository.releaseReview(project._id, project.ownerId, document._id);
      throw error;
    }
    await this.projectRepository.markInReview(project._id, now);
    return clean(document);
  }

  async applyToReview(architectId, reviewId, data = {}) {
    const architect = await this.approvedArchitect(architectId);
    const amount = Number(data.amount);
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'La postulación debe incluir un precio mayor que cero');
    }
    if (!message || message.length > 500) {
      throw new HttpError(400, 'El mensaje debe tener entre 1 y 500 caracteres');
    }
    const existing = await this.reviewRequestRepository.findForApplication(
      objectId(reviewId, 'Solicitud'),
    );
    if (!existing) throw new HttpError(409, 'La solicitud ya no acepta postulaciones');
    const now = new Date();
    const result = await this.reviewRequestRepository.addApplication(existing, architect._id, {
      _id: new ObjectId(),
      architectId: architect._id,
      amount,
      message,
      status: 'pending',
      createdAt: now,
    });
    if (!result.modifiedCount) {
      throw new HttpError(409, 'Ya postulaste o la solicitud dejó de estar disponible');
    }
    return { applied: true };
  }

  async assignReview(ownerId, projectId, reviewId, applicationId) {
    const project = await this.ownedProject(projectId, ownerId);
    const review = await this.reviewRequestRepository.findApplicationForOwner(
      objectId(reviewId, 'Solicitud'),
      project._id,
      project.ownerId,
    );
    if (!review) throw new HttpError(409, 'La solicitud ya no permite elegir una postulación');
    const application = (review.applications || []).find((item) =>
      item._id.toHexString() === String(applicationId));
    if (!application) throw new HttpError(404, 'Postulación no encontrada');
    await this.approvedArchitect(application.architectId.toHexString());
    const applications = review.applications.map((item) => ({
      ...item,
      status: item._id.equals(application._id) ? 'accepted' : 'closed',
    }));
    const result = await this.reviewRequestRepository.assignApplication(
      review,
      application.architectId,
      applications,
      new Date(),
    );
    if (!result.modifiedCount) throw new HttpError(409, 'La solicitud cambió y no se pudo asignar');
    return this.findReview(review._id);
  }

  async acceptDirectedReview(architectId, reviewId) {
    const architect = await this.approvedArchitect(architectId);
    const result = await this.reviewRequestRepository.acceptDirected(
      objectId(reviewId, 'Solicitud'),
      architect._id,
      new Date(),
    );
    if (!result.modifiedCount) throw new HttpError(409, 'La solicitud dirigida ya no está disponible para aceptar');
    return this.findReview(objectId(reviewId, 'Solicitud'));
  }

  async rejectDirectedReview(architectId, reviewId) {
    const architect = await this.approvedArchitect(architectId);
    const review = await this.reviewRequestRepository.findDirectedForArchitect(
      objectId(reviewId, 'Solicitud'),
      architect._id,
    );
    if (!review) throw new HttpError(409, 'La solicitud dirigida ya no se puede rechazar');
    const result = await this.reviewRequestRepository.rejectDirected(
      review,
      architect._id,
      new Date(),
    );
    if (!result.modifiedCount) throw new HttpError(409, 'La solicitud dirigida ya no se puede rechazar');
    await this.releaseReviewSlot(review);
    return this.findReview(review._id);
  }

  async cancelReview(ownerId, projectId, reviewId) {
    const project = await this.ownedProject(projectId, ownerId);
    const review = await this.reviewRequestRepository.findActiveForOwnerCancellation(
      objectId(reviewId, 'Solicitud'),
      project._id,
      project.ownerId,
      ['open', 'directed', 'with_applications', 'assigned', 'in_review'],
    );
    if (!review) throw new HttpError(409, 'La solicitud ya no se puede cancelar');
    const result = await this.reviewRequestRepository.cancel(
      review,
      (review.applications || []).map((application) => ({
          ...application,
          status: 'closed',
      })),
      new Date(),
    );
    if (!result.modifiedCount) throw new HttpError(409, 'La solicitud ya no se puede cancelar');
    await this.releaseReviewSlot(review);
  }

  async findReview(id) {
    const review = await this.reviewRequestRepository.findById(id);
    return review ? clean(review) : null;
  }

  async listProjectReviews(ownerId, projectId) {
    const project = await this.ownedProject(projectId, ownerId);
    const reviews = await this.reviewRequestRepository.listByProjectAndOwner(project._id, project.ownerId);
    const observations = await this.architectObservationRepository.listByProjectAndOwner(
      project._id,
      project.ownerId,
    );
    const withDetails = await Promise.all(reviews.map(async (review) => {
      const architect = review.architectId
        ? await this.userRepository.findDocumentById(review.architectId)
        : null;
      const applications = await Promise.all((review.applications || []).map(async (application) => {
        const applicant = await this.userRepository.findDocumentById(application.architectId);
        return {
          id: application._id.toHexString(),
          architect: applicant ? await this.architectSummary(applicant) : null,
          amount: application.amount,
          message: application.message,
          status: application.status,
        };
      }));
      return {
        ...clean(review),
        architect: architect ? await this.architectSummary(architect) : null,
        applications,
        dictamenObservation: review.dictamenObservation || null,
      };
    }));
    const deliveredNotes = reviews
      .filter((review) => review.dictamenObservation)
      .map((review) => ({
        id: review._id.toHexString() + ':dictamen',
        reviewId: review._id.toHexString(),
        observation: review.dictamenObservation,
        dictamen: review.dictamen,
        createdAt: review.deliveredAt,
      }));
    return {
      reviews: withDetails,
      observations: observations.map(clean).concat(deliveredNotes),
    };
  }

  async listAssignedReviews(architectId) {
    const architect = await this.approvedArchitect(architectId);
    const items = await this.reviewRequestRepository.findAssignedForArchitect(architect._id);
    return Promise.all(items.map(async (item) => {
      const [project, owner] = await Promise.all([
        this.projectRepository.findDocumentById(item.projectId),
        this.userRepository.findNameById(item.ownerId),
      ]);
      const paymentState = await this.contractedProjectService.getPaymentState(item.projectId, item.ownerId);
      const projectProposalId = paymentState.paid && paymentState.proposalId
        ? objectId(paymentState.proposalId, 'Propuesta')
        : item.proposalId;
      const proposal = projectProposalId
        ? await this.proposalRepository.findForContract(
          item.projectId,
          item.ownerId,
          projectProposalId,
        )
        : null;
      const observations = await this.architectObservationRepository.listByReviewAndArchitect(
        item._id,
        item.architectId,
      );
      const profile = architect ? await this.architectSummary(architect) : null;
      return {
        ...clean(item),
        applications: (item.applications || []).map((application) => ({
          id: application._id.toHexString(),
          architectId: application.architectId.toHexString(),
          amount: application.amount,
          message: application.message,
          status: application.status,
        })),
        project: project ? {
          id: project._id.toHexString(),
          nombre: project.nombre,
          estado: project.estado,
          presupuesto: project.presupuesto,
          payment: paymentState,
        } : null,
        clientName: owner ? owner.nombre : 'Cliente',
        architect: profile,
        proposal: proposal ? {
          id: proposal._id.toHexString(),
          nombre: proposal.name,
          areaM2: proposal.estimate && proposal.estimate.areaM2,
        } : null,
        observations: observations.map(clean),
      };
    }));
  }

  async addObservation(architect, reviewId, text) {
    await this.approvedArchitect(architect.id);
    const observation = typeof text === 'string' ? text.trim() : '';
    if (!observation) throw new HttpError(400, 'La observación no puede estar vacía');
    if (observation.length > 5000) throw new HttpError(400, 'La observación supera el límite de 5000 caracteres');
    const review = await this.reviewRequestRepository.findActiveForArchitect(
      objectId(reviewId, 'Solicitud'),
      objectId(architect.id, 'Arquitecto'),
    );
    if (!review) throw new HttpError(404, 'Solicitud no asignada o no disponible');
    if (review.status !== 'in_review') {
      throw new HttpError(409, 'Inicia la revisión asignada antes de registrar observaciones');
    }
    const now = new Date();
    const document = {
      reviewId: review._id,
      projectId: review.projectId,
      ownerId: review.ownerId,
      architectId: review.architectId,
      observation,
      createdAt: now,
    };
    return clean(await this.architectObservationRepository.create(document));
  }

  async startReview(architectId, reviewId) {
    const architect = await this.approvedArchitect(architectId);
    const result = await this.reviewRequestRepository.start(
      objectId(reviewId, 'Solicitud'),
      architect._id,
      new Date(),
    );
    if (!result.modifiedCount) throw new HttpError(409, 'Solo se puede iniciar una revisión asignada');
  }

  async deliverReview(architectId, reviewId, data = {}) {
    const architect = await this.approvedArchitect(architectId);
    const allowedOpinions = new Set(['approved_with_observations', 'requires_adjustments', 'not_recommended']);
    const opinion = data.dictamen;
    if (!allowedOpinions.has(opinion)) throw new HttpError(400, 'Selecciona un dictamen válido');
    const observation = typeof data.observation === 'string' ? data.observation.trim() : '';
    if (!observation || observation.length > 5000) {
      throw new HttpError(400, 'El dictamen debe incluir observaciones de hasta 5000 caracteres');
    }
    const review = await this.reviewRequestRepository.findInProgressForArchitect(
      objectId(reviewId, 'Solicitud'),
      architect._id,
    );
    if (!review) throw new HttpError(409, 'Solo se puede entregar una revisión en curso');
    const now = new Date();
    const result = await this.reviewRequestRepository.deliver(
      review,
      architect._id,
      opinion,
      observation,
      now,
    );
    if (!result.modifiedCount) throw new HttpError(409, 'La revisión cambió y no se pudo entregar');
    await this.releaseReviewSlot(review);
  }

  async rateReview(ownerId, projectId, reviewId, rating) {
    const project = await this.ownedProject(projectId, ownerId);
    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new HttpError(400, 'La calificación debe ser un entero de 1 a 5');
    }
    const result = await this.reviewRequestRepository.rate(
      objectId(reviewId, 'Solicitud'),
      project._id,
      project.ownerId,
      score,
      new Date(),
    );
    if (!result.modifiedCount) throw new HttpError(409, 'La revisión no está entregada o ya fue calificada');
  }
}

module.exports = ReviewService;
