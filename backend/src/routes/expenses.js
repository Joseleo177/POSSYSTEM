const router = require('express').Router();
const { auth, permit } = require('../middleware/auth');
const ctrl = require('../controllers/expenseController');

router.use(auth);

router.get('/',           ctrl.getAll);
router.get('/categories', ctrl.getCategories);
router.post('/categories', permit('config'), ctrl.upsertCategory);
router.post('/',          permit('sales', 'config'), ctrl.create);
router.delete('/:id',    permit('admin', 'config'), ctrl.voidExpense);

module.exports = router;
