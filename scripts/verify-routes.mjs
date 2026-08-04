import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const BASE = 'http://localhost:5000';
const uri = process.env.MONGO_URI;
await mongoose.connect(uri);
const User = mongoose.connection.collection('users');
const main = await User.findOne({ email: 'manikantasandula1234@gmail.com' });
await mongoose.disconnect();

const token = jwt.sign({ id: main._id.toString() }, process.env.JWT_SECRET, { expiresIn: '15m' });
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// PUT /api/family/baby - no-op (empty body, no field changes)
const putRes = await fetch(`${BASE}/api/family/baby?familyId=6a6f25c4a81b7bd8b233eccc`, {
  method: 'PUT', headers, body: '{}'
});
console.log('PUT /family/baby status:', putRes.status, JSON.stringify(await putRes.json()));

// DELETE /api/family - for a family the user does NOT belong to -> expect 403
const delRes = await fetch(`${BASE}/api/family?familyId=6a5f337104b74d9022f113c0`, {
  method: 'DELETE', headers
});
console.log('DELETE /family (not member) status:', delRes.status, JSON.stringify(await delRes.json()));

// DELETE /api/family - for a family the user IS a parent of, but confirm dialog not shown -> we will NOT send this.
// Instead verify route exists by checking a bad ObjectId -> expect 400
const badRes = await fetch(`${BASE}/api/family?familyId=not-an-oid`, {
  method: 'DELETE', headers
});
console.log('DELETE /family (bad oid) status:', badRes.status, JSON.stringify(await badRes.json()));

// /api/drive/auth-url with a non-parent family (Kushi, role member/pending) -> expect 403
const driveRes = await fetch(`${BASE}/api/drive/auth-url?familyId=6a672e8d7316cfdaa1101716`, {
  headers
});
console.log('drive/auth-url (member) status:', driveRes.status, JSON.stringify(await driveRes.json()));

// /api/drive/auth-url with parent family -> expect 200 url
const driveRes2 = await fetch(`${BASE}/api/drive/auth-url?familyId=6a6f25c4a81b7bd8b233eccc`, {
  headers
});
const driveJson = await driveRes2.json();
console.log('drive/auth-url (parent) status:', driveRes2.status, 'has url:', !!driveJson.url);
