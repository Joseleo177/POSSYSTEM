const router = require('express').Router();
const { auth, permit } = require('../middleware/auth');
const ctrl = require('../controllers/incomeController');

router.use(auth);

router.get('/', permit("accounting.view"),            ctrl.getAll);
router.get('/categories', permit("accounting.view"),  ctrl.getCategories);
router.post('/categories', permit("config.edit"), ctrl.upsertCategory);
router.post('/',           permit("accounting.income"), ctrl.create);
// El permanente va antes que '/:id' para que Express no lo capture como un id.
router.delete('/:id/permanent', permit("accounting.delete"), ctrl.deleteIncome);
router.delete('/:id',      permit("accounting.void"), ctrl.voidIncome);

module.exports = router;
