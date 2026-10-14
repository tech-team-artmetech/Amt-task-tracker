import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let firebaseConfig: any = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn('[firebase-admin] Failed to read firebase-applet-config.json:', e);
}

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId || 'task-management-tool-509306',
  });
}

export const adminAuth = getAuth();
