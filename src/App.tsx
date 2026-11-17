import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { GamesPage } from './pages/GamesPage';
import { PlayPage } from './pages/PlayPage';
import { MissionsPage } from './pages/MissionsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { WithdrawPage } from './pages/WithdrawPage';
import { FaqPage } from './pages/FaqPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { AuthPage } from './pages/AuthPage';
import { DeleteAccountPage } from './pages/DeleteAccountPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/index.html" element={<Navigate to="/" replace />} />
                <Route path="/games" element={<GamesPage />} />
                <Route path="/play/:gameId" element={<PlayPage />} />
                <Route path="/play.html" element={<Navigate to="/games" replace />} />
                <Route path="/missions" element={<MissionsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/referral.html" element={<Navigate to="/profile" replace />} />
                <Route path="/withdraw" element={<WithdrawPage />} />
                <Route path="/withdraw.html" element={<Navigate to="/withdraw" replace />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="/leaderboard.html" element={<Navigate to="/leaderboard" replace />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/auth.html" element={<Navigate to="/auth" replace />} />
                <Route path="/delete-account" element={<DeleteAccountPage />} />
                <Route path="/delete-account.html" element={<Navigate to="/delete-account" replace />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin.html" element={<Navigate to="/admin" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
