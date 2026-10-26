// Low-level localStorage adapter used by the ViMod data services.
class StorageRepository {
  get(key) {
    const data = localStorage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error("Datos inválidos en localStorage:", key, error);
      return null;
    }
  }

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key) {
    localStorage.removeItem(key);
  }
}
