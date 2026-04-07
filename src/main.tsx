// Author: Nguyen Xuan Hai
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PhotoBoothPage from './pages/PhotoBoothPage.tsx';
import './index.css';

const APP_AUTHOR = 'Nguyen Xuan Hai';
document.documentElement.setAttribute('data-author', APP_AUTHOR);

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';

const getPageByPath = () => {
  if (normalizedPath === '/photoboth') return PhotoBoothPage;
  return App;
};

const Page = getPageByPath();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
