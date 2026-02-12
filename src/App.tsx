import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import HistoryPage from './pages/HistoryPage';
import ArticlePage from './pages/ArticlePage';
import GamesPage from './pages/GamesPage';
import LinkQuestPage from './pages/LinkQuestPage';
import LinkQuestResultsPage from './pages/LinkQuestResultsPage';
import LinkQuestExplorePage from './pages/LinkQuestExplorePage';
import { initiateDykPreload } from './services/preloadService';

initiateDykPreload();

const AppContent: React.FC = () => {
  const location = useLocation();
  const isLinkQuestRoute = location.pathname.startsWith('/games/linkquest');
  
  return (
    <>
      {!isLinkQuestRoute && <NavBar />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/linkquest" element={<LinkQuestPage />} />
        <Route path="/games/linkquest/results" element={<LinkQuestResultsPage />} />
        <Route path="/games/linkquest/explore" element={<LinkQuestExplorePage />} />
        <Route path="/article/:title" element={<ArticlePage />} />
      </Routes>
    </>
  );
};

const App: React.FC = () => (
  <Router basename="/wikipedia-app-prototype">
    <AppContent />
  </Router>
);

export default App; 