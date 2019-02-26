const { forwardTo } = require('prisma-binding');
const { hasPermission } = require('../utils')

const Query = {
  items: forwardTo('db'),
  item: (parent, { where }, context, info) => {
    return context.db.query.item({ where });
  },
  itemsConnection: forwardTo('db'),
  me: (parent, args, context, info) => {
    if (!context.request.userId) {
      return null
    }

    return context.db.query.user({
      where: {
        id: context.request.userId,
      },
    }, info)
  },
  users: async (parent, args, context, info) => {
    if (!context.request.userId) {
      throw new Error('You must be logged in!')
    }

    hasPermission(context.request.user, ['ADMIN', 'PERMISSIONUPDATE'])

    return context.db.query.users({}, info)
  },
};

module.exports = Query;
