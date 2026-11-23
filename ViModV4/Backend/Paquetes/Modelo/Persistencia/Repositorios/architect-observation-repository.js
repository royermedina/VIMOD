const { getDb } = require('../AccesoDatos');

class ArchitectObservationRepository {
  async create(document) {
    const result = await getDb().collection('architectObservations').insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async listByProjectAndOwner(projectId, ownerId) {
    return getDb().collection('architectObservations').find({ projectId, ownerId })
      .sort({ createdAt: -1 }).toArray();
  }

  async listByReviewAndArchitect(reviewId, architectId) {
    return getDb().collection('architectObservations').find({ reviewId, architectId })
      .sort({ createdAt: -1 }).toArray();
  }
}

module.exports = ArchitectObservationRepository;
