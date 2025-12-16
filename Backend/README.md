Planner Backend (in-memory)

This is a minimal Express backend used for the Planner frontend demo. It uses in-memory data (no database) and supports file uploads (files are saved to /uploads).

Run:

```bash
cd Backend
npm install
npm run dev
```

API endpoints (summary):
- GET /api/buckets
- POST /api/buckets { title }
- PUT /api/buckets/:id { title }
- DELETE /api/buckets/:id

- GET /api/tasks/:id
- POST /api/tasks { bucketId, task }
- PUT /api/tasks/:id { task }
- DELETE /api/tasks/:id
- POST /api/tasks/:id/move { fromBucketId, toBucketId, toIndex }

- GET /api/users
- GET /api/labels

- POST /api/uploads (multipart form, field `file`) -> returns { id, name, size, url }

Notes:
- The previous in-memory implementation has been replaced by a MongoDB-backed server.
- Set `MONGODB_URI` in `.env` or use the default `mongodb://127.0.0.1:27017/planner`.
- Run `node seed.js` to populate initial users, team, board, buckets and tasks.
- CORS is enabled for http://localhost:5174 (default Vite dev server for frontend). If your frontend runs on a different port, update `index.js` accordingly.
