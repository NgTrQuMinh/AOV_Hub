/**
 * core/db.js - Database Mocking (Singleton Pattern)
 * "File JSON trung tâm trong bộ nhớ" (JS Object)
 */
const DB_STATE = {
  users: [],
  posts: [],
  comments: [],
  likes: {},
  heroes: [],
  items: [],
  builds: [],
};

const DB = Object.freeze({
  state: DB_STATE,
});

export function getDB() {
  return DB;
}

export function resetDB() {
  const s = DB_STATE;
  s.users = [];
  s.posts = [];
  s.comments = [];
  s.likes = {};
  s.heroes = [];
  s.items = [];
  s.builds = [];
}
