const router = require('express').Router();
const { auth, permit } = require('../middleware/auth');
const ctrl = require('../controllers/quotationController');

router.use(auth);

router.get('/', permit("sales.view"),           ctrl.getAll);
router.get('/:id', permit("sales.view"),        ctrl.getOne);
router.post('/',          permit("sales.create"), ctrl.create);
router.patch('/:id/cancel',  permit("sales.edit"), ctrl.cancel);
router.post('/:id/convert',  permit("sales.create"), ctrl.convert);
router.delete('/:id',        permit("sales.void"), ctrl.remove);

module.exports = router;
