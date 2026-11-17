import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, type Firestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB1jN9vaax8Bqycj1YweGx-DpTdrMxnkis',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gamoro-e48db.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gamoro-e48db',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gamoro-e48db.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '330424559122',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:330424559122:web:9793e63b9d6a97ba949acb',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      !firebaseConfig.apiKey.includes('YOUR_API_KEY') &&
      firebaseConfig.projectId &&
      !firebaseConfig.projectId.includes('YOUR_PROJECT_ID')
  );
}

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

export type FirestoreOperationType = 'create' | 'get' | 'list' | 'update' | 'delete' | 'write';

export function handleFirestoreError(error: unknown, operationType: FirestoreOperationType, path: string) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified ?? false,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'config', 'announcement'));
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.includes('the client is offline')) {
      console.error('Firestore offline — check Firebase project connectivity.');
    }
    return false;
  }
}
