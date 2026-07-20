import { google } from 'googleapis';
import { Readable } from 'stream';

export const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/drive/callback'
  );
};

export const setDriveCredentials = (refreshToken: string) => {
  const oAuth2Client = getOAuth2Client();
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oAuth2Client });
};

export const getOrCreateFolder = async (drive: any, folderName: string, parentFolderId: string) => {
  const escapedName = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const query = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and '${parentFolderId}' in parents and trashed=false`;
  
  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Not found, create it
  return await createFolder(drive, folderName, parentFolderId);
};

export const createFolder = async (drive: any, folderName: string, parentFolderId?: string) => {
  const fileMetadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) {
    fileMetadata.parents = [parentFolderId];
  }
  const file = await drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });
  return file.data.id;
};

export const uploadFileStream = async (drive: any, fileStream: Readable, fileName: string, mimeType: string, parentFolderId?: string) => {
  const fileMetadata: any = {
    name: fileName,
  };
  if (parentFolderId) {
    fileMetadata.parents = [parentFolderId];
  }
  
  const media = {
    mimeType: mimeType,
    body: fileStream
  };
  
  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, size'
  });
  return file.data;
};

export const getFileStream = async (drive: any, fileId: string): Promise<Readable> => {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data;
};

export const deleteFile = async (drive: any, fileId: string) => {
  await drive.files.delete({ fileId });
};
