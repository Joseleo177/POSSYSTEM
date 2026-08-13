const router = require('express').Router();
const { auth, permit } = require('../middleware/auth');
const ctrl = require('../controllers/incomeController');

router.use(auth);

router.get('/',            ctrl.getAll);
router.get('/categories',  ctrl.getCategories);
router.post('/categories', permit('config'), ctrl.upsertCategory);
router.post('/',           permit('sales', 'config'), ctrl.create);
// El permanente va antes que '/:id' para que Express no lo capture como un id.
router.delete('/:id/permanent', permit('admin', 'config'), ctrl.deleteIncome);
router.delete('/:id',      permit('admin', 'config'), ctrl.voidIncome);

module.exports = router;
