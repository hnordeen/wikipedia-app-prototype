import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import HistoryPage from './pages/HistoryPage';
import ArticlePage from './pages/ArticlePage';
import { initiateDykPreload } from './services/preloadService';

initiateDykPreload();

const App: React.FC = () => (
  <Router basename="/wikipedia-app-prototype">
    <NavBar />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/article/:title" element={<ArticlePage />} />
    </Routes>
  </Router>
);

export default App; 