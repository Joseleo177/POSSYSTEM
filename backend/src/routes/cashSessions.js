const router = require('express').Router();
const ctrl   = require('../controllers/cashSessions');
const { auth, permit } = require('../middleware/auth');

router.post('/open',         auth, permit("sales.cash"), ctrl.openSession);
router.get('/current',       auth, permit("sales.cash"), ctrl.getCurrent);
router.get('/history',       auth, permit("sales.view"), ctrl.getHistory);
router.get('/:id/summary',   auth, permit("sales.view"), ctrl.getSummary);
router.post('/:id/close',    auth, permit("sales.cash"), ctrl.closeSession);

module.exports = router;
