import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const BASE = process.env.CLIENT_URL ? 'http://localhost:5000' : 'http://localhost:5000';

const uri = process.env.MONGO_URI;
await mongoose.connect(uri);
const User = mongoose.connection.collection('users');
const main = await User.findOne({ email: 'manikantasandula1234@gmail.com' });
await mongoose.disconnect();

const token = jwt.sign({ id: main._id.toString() }, process.env.JWT_SECRET, { expiresIn: '15m' });
const refreshToken = jwt.sign({ id: main._id.toString() }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Cookie: `refreshToken=${refreshToken}` };

const j = (r) => r.json().catch(() => null);

const raw = await fetch(`${BASE}/api/auth/me`, { headers });
console.log('=== /api/auth/me raw ===');
console.log('status:', raw.status);
const meRes = await raw.json().catch(() => null);
console.log('user.name:', meRes?.user?.name);
console.log('families count:', meRes?.user?.families?.length);
console.log('families JSON:', JSON.stringify(meRes?.user?.families, null, 2));
for (const f of meRes?.user?.families || []) {
  console.log(`  fam=${f.familyId?._id} baby="${f.familyId?.babyName}" role=${f.role} status=${f.status} driveFolder=${f.familyId?.driveFolderId || 'none'}`);
}

for (const f of meRes?.user?.families || []) {
  const fid = f.familyId?._id;
  const dash = await j(await fetch(`${BASE}/api/family/dashboard?familyId=${fid}`, { headers }));
  console.log(`\n=== dashboard familyId=${fid} "${f.familyId?.babyName}" ===`);
  console.log('  status:', dash?.status, 'userStatus:', dash?.userStatus, 'userRole:', dash?.userRole, 'babyName:', dash?.babyName, 'photos:', dash?.photosCount, 'memories:', dash?.memoriesCount);

  const photos = await j(await fetch(`${BASE}/api/photos?familyId=${fid}&limit=2`, { headers }));
  console.log('  /api/photos status:', photos?.status ?? photos?.pagination?.total ?? 'ok');
  const mems = await j(await fetch(`${BASE}/api/memories?familyId=${fid}&limit=2`, { headers }));
  console.log('  /api/memories total:', mems?.pagination?.total ?? 'ok');
  const members = await j(await fetch(`${BASE}/api/family/members?familyId=${fid}`, { headers }));
  console.log('  /api/family/members status:', members?.status, 'members:', members?.members?.length, 'pending:', members?.pendingRequests?.length);
}
