import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './NavBar.css';

const NavBar: React.FC = () => {
  const location = useLocation();
  
  // Helper function to check if a path is active
  // For games, we want to match /games and all sub-routes like /games/linkquest
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path === '/games') {
      return location.pathname.startsWith('/games');
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };
  
  return (
    <nav className="nav-bar">
      <Link 
        to="/" 
        className={`nav-item ${isActive('/') ? 'active' : ''}`}
      >
        <svg className="nav-icon" viewBox="0 0 24 24">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/>
        </svg>
        Explore
      </Link>
      <Link 
        to="/search" 
        className={`nav-item ${isActive('/search') ? 'active' : ''}`}
      >
        <svg className="nav-icon" viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor"/>
        </svg>
        Search
      </Link>
      <Link 
        to="/history" 
        className={`nav-item ${isActive('/history') ? 'active' : ''}`}
      >
        <svg className="nav-icon" viewBox="0 0 24 24">
          <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z" fill="currentColor"/>
        </svg>
        Activity
      </Link>
      <Link 
        to="/games" 
        className={`nav-item ${isActive('/games') ? 'active' : ''}`}
      >
        <svg className="nav-icon" viewBox="0 0 24 24">
          <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm4 3H6v2H4v2h2v2h2v-2h2v-2H8V9zm8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-3 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" fill="currentColor"/>
        </svg>
        Games
      </Link>
    </nav>
  );
};

export default NavBar; 