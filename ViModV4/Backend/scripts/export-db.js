const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27021';
const dbName = process.env.MONGODB_DATABASE || 'vimod';
const SENSITIVE = ['passwordHash', 'token'];

(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const out = { database: dbName, exportedAt: new Date().toISOString(), collections: {} };
    const names = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of names) {
      const docs = await db.collection(name).find({}).toArray();
      out.collections[name] = docs.map((doc) => {
        for (const key of SENSITIVE) delete doc[key];
        return doc;
      });
      console.log(`${name}: ${docs.length} documentos`);
    }
    const dir = path.join(__dirname, '..', 'export');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${dbName}-export.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
    console.log('Archivo creado:', file);
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error('Error al exportar:', error.message);
  process.exitCode = 1;
});