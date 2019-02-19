const { forwardTo } = require('prisma-binding');

const Query = {
  items: forwardTo('db'),
  item: (parent, { where }, context, info) => {
    return context.db.query.item({ where });
  },
  itemsConnection: forwardTo('db'),
};

module.exports = Query;
