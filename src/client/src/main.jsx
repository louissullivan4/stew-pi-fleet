import React from 'react';
import { createRoot } from 'react-dom/client';

// Carbon styles — must come before component imports
import '@carbon/styles/css/styles.css';
import './styles/overrides.scss';

import App from './App';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
