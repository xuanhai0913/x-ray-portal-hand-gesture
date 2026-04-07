// Author: Nguyen Xuan Hai
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const APP_AUTHOR = 'Nguyen Xuan Hai';
document.documentElement.setAttribute('data-author', APP_AUTHOR);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
