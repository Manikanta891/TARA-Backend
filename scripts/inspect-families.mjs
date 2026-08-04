import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
if (!uri) { console.error('MONGO_URI missing'); process.exit(1); }
await mongoose.connect(uri);

const User = mongoose.connection.collection('users');
const Family = mongoose.connection.collection('families');

const users = await User.find({}).project({ name: 1, email: 1, familyId: 1, role: 1, status: 1, relationshipToBaby: 1, nickname: 1, families: 1 }).toArray();

for (const u of users) {
  const famIds = new Set((u.families || []).map(f => f.familyId?.toString()));
  const legacy = u.familyId?.toString();
  const overlap = legacy && famIds.has(legacy);
  console.log('---');
  console.log(`email=${u.email} name=${u.name}`);
  console.log(`legacy familyId=${legacy} legacyRole=${u.role} legacyStatus=${u.status} legacyRel=${u.relationshipToBaby}`);
  console.log(`families[] count=${(u.families||[]).length} overlap=${overlap}`);
  for (const f of (u.families || [])) {
    const familyDoc = await Family.findOne({ _id: f.familyId });
    console.log(`  fam=${f.familyId} role=${f.role} status=${f.status} rel=${f.relationshipToBaby} nick=${f.nickname} baby="${familyDoc?.babyName || '?'}" driveFolder=${familyDoc?.driveFolderId || 'none'}`);
  }
}

console.log('\n=== ALL FAMILIES ===');
const fams = await Family.find({}).project({ babyName: 1, inviteCode: 1, driveFolderId: 1, driveRefreshToken: 1, createdAt: 1 }).toArray();
for (const f of fams) {
  console.log(`fam=${f._id} baby="${f.babyName}" invite=${f.inviteCode} driveFolder=${f.driveFolderId || 'none'} hasToken=${!!f.driveRefreshToken}`);
}

await mongoose.disconnect();
