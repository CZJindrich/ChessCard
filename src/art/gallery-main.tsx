/**
 * Dev-only art gallery entry (`npx vite` → /gallery.html). Renders every procedural
 * asset for visual QA. Not part of the production build.
 */
import { createRoot } from 'react-dom/client';
import './fonts';
import './art.css';
import './gallery/gallery.css';
import { Gallery } from './gallery/Gallery';

const root = document.getElementById('root');
if (root) createRoot(root).render(<Gallery />);
