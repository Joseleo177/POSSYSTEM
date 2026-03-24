const router = require('express').Router();
const ctrl   = require('../controllers/cashSessions');
const { auth, permit } = require('../middleware/auth');

router.post('/open',         auth, permit('sales', 'config'), ctrl.openSession);
router.get('/current',       auth, permit('sales', 'reports', 'config'), ctrl.getCurrent);
router.get('/history',       auth, permit('sales', 'reports', 'config'), ctrl.getHistory);
router.get('/:id/summary',   auth, permit('sales', 'reports', 'config'), ctrl.getSummary);
router.post('/:id/close',    auth, permit('sales', 'config'), ctrl.closeSession);

module.exports = router;
