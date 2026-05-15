const router = require('express').Router();
const { auth, permit } = require('../middleware/auth');
const ctrl = require('../controllers/quotationController');

router.use(auth);

router.get('/',           ctrl.getAll);
router.get('/:id',        ctrl.getOne);
router.post('/',          permit('sales', 'config'), ctrl.create);
router.patch('/:id/cancel',  permit('admin', 'config'), ctrl.cancel);
router.post('/:id/convert',  permit('sales', 'config'), ctrl.convert);

module.exports = router;
