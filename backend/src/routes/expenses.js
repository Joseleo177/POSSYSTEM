const router = require('express').Router();
const { auth } = require('../middleware/auth');
const ctrl = require('../controllers/expenseController');

router.use(auth);

router.get('/',           ctrl.getAll);
router.get('/categories', ctrl.getCategories);
router.post('/categories', ctrl.upsertCategory);
router.post('/',          ctrl.create);
router.delete('/:id',    ctrl.voidExpense);

module.exports = router;
