const { getDb } = require('../AccesoDatos');

class ReviewRequestRepository {
  async countAll() {
    return getDb().collection('reviewRequests').countDocuments();
  }

  async listForAdmin(limit) {
    return getDb().collection('reviewRequests').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async averageRatingForArchitect(architectId) {
    const results = await getDb().collection('reviewRequests').aggregate([
      { $match: { architectId, rating: { $type: 'number' } } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray();
    return results[0] || null;
  }

  async findActiveForProject(projectId, ownerId) {
    return getDb().collection('reviewRequests').findOne({
      projectId,
      ownerId,
      active: true,
    });
  }

  async findForApplication(reviewId) {
    return getDb().collection('reviewRequests').findOne({
      _id: reviewId,
      mode: 'open',
      status: { $in: ['open', 'with_applications'] },
    });
  }

  async findApplicationForOwner(id, projectId, ownerId) {
    return getDb().collection('reviewRequests').findOne({
      _id: id,
      projectId,
      ownerId,
      mode: 'open',
      status: 'with_applications',
      active: true,
    });
  }

  async findById(id) {
    return getDb().collection('reviewRequests').findOne({ _id: id });
  }

  async findDirectedForArchitect(id, architectId) {
    return getDb().collection('reviewRequests').findOne({
      _id: id,
      architectId,
      mode: 'directed',
      status: 'directed',
      active: true,
    });
  }

  async findActiveForOwnerCancellation(id, projectId, ownerId, statuses) {
    return getDb().collection('reviewRequests').findOne({
      _id: id,
      projectId,
      ownerId,
      status: { $in: statuses },
      active: true,
    });
  }

  async addApplication(review, architectId, application) {
    return getDb().collection('reviewRequests').updateOne({
      _id: review._id,
      mode: 'open',
      status: { $in: ['open', 'with_applications'] },
      applications: { $not: { $elemMatch: { architectId } } },
    }, {
      $push: { applications: application },
      $set: { status: 'with_applications', updatedAt: application.createdAt },
    });
  }

  async assignApplication(review, architectId, applications, now) {
    return getDb().collection('reviewRequests').updateOne({
      _id: review._id,
      ownerId: review.ownerId,
      status: 'with_applications',
      active: true,
    }, {
      $set: {
        architectId,
        status: 'assigned',
        active: true,
        applications,
        updatedAt: now,
      },
    });
  }

  async acceptDirected(id, architectId, now) {
    return getDb().collection('reviewRequests').updateOne({
      _id: id,
      architectId,
      mode: 'directed',
      status: 'directed',
      active: true,
    }, { $set: { status: 'assigned', updatedAt: now } });
  }

  async rejectDirected(review, architectId, now) {
    return getDb().collection('reviewRequests').updateOne({
      _id: review._id,
      architectId,
      status: 'directed',
      active: true,
    }, { $set: { status: 'rejected', active: false, updatedAt: now } });
  }

  async cancel(review, applications, now) {
    return getDb().collection('reviewRequests').updateOne({
      _id: review._id,
      ownerId: review.ownerId,
      status: review.status,
      active: true,
    }, {
      $set: {
        status: 'canceled',
        active: false,
        applications,
        updatedAt: now,
      },
    });
  }

  async start(id, architectId, now) {
    return getDb().collection('reviewRequests').updateOne({
      _id: id,
      architectId,
      status: 'assigned',
      active: true,
    }, { $set: { status: 'in_review', startedAt: now, updatedAt: now } });
  }

  async findInProgressForArchitect(id, architectId) {
    return getDb().collection('reviewRequests').findOne({
      _id: id,
      architectId,
      status: 'in_review',
      active: true,
    });
  }

  async deliver(review, architectId, opinion, observation, now) {
    return getDb().collection('reviewRequests').updateOne({
      _id: review._id,
      architectId,
      status: 'in_review',
      active: true,
    }, {
      $set: {
        status: 'delivered',
        active: false,
        dictamen: opinion,
        dictamenObservation: observation,
        deliveredAt: now,
        updatedAt: now,
      },
    });
  }

  async rate(id, projectId, ownerId, score, now) {
    return getDb().collection('reviewRequests').updateOne({
      _id: id,
      projectId,
      ownerId,
      status: 'delivered',
      rating: { $exists: false },
    }, { $set: { rating: score, ratedAt: now, updatedAt: now } });
  }

  async create(document) {
    return getDb().collection('reviewRequests').insertOne(document);
  }

  async findAssignedForArchitect(architectId) {
    return getDb().collection('reviewRequests').find({
      $or: [
        { architectId },
        { mode: 'open', status: { $in: ['open', 'with_applications'] } },
      ],
    }).sort({ createdAt: -1 }).toArray();
  }

  async findActiveForArchitect(id, architectId) {
    return getDb().collection('reviewRequests').findOne({
      _id: id,
      architectId,
      active: true,
    });
  }

  async updateForAdminAssignment(reviewId, architectId) {
    return getDb().collection('reviewRequests').updateOne({
      _id: reviewId,
      status: { $in: ['open', 'with_applications'] },
      active: true,
    }, {
      $set: {
        architectId,
        mode: 'directed',
        status: 'assigned',
        active: true,
        updatedAt: new Date(),
      },
    });
  }

  async listByProjectAndOwner(projectId, ownerId) {
    return getDb().collection('reviewRequests').find({ projectId, ownerId })
      .sort({ createdAt: -1 }).toArray();
  }
}

module.exports = ReviewRequestRepository;
