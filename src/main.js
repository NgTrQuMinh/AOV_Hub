import './style.css';

import { renderHeader } from './js/header.js';
import { renderFooter } from './js/footer.js';
import { renderHeroesGrid } from './js/heroes.js';
import { renderFeedList } from './js/feed.js';

const headerRoot = document.getElementById('header-root');
const footerRoot = document.getElementById('footer-root');
const heroesGrid = document.getElementById('heroes-grid');
const feedList = document.getElementById('feed-list');

renderHeader(headerRoot);
renderFooter(footerRoot);
renderHeroesGrid(heroesGrid);
renderFeedList(feedList);
