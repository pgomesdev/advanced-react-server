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
  order: async (parent, args, context, info) => {
    const { userId } = context.request

    if (!userId) {
      throw new Error('You must be logged in')
    }

    const order = await context.db.query.order({
      where: { id: args.id },
    }, info)

    const ownsOrder = order.user.id === userId
    const hasPermissionToSeeOrder = context.request.user.permissions.includes('ADMIN')

    if (!ownsOrder && !hasPermissionToSeeOrder) {
      throw new Error('You can\'t see this')
    }

    return order
  },
  orders: async (parent, args, context, info) => {
    const { userId } = context.request

    if (!userId) {
      throw new Error('You must be logged in')
    }

    return context.db.query.orders({
      where: {
        user: {
          id: userId,
        },
      },
    }, info)
  },
};

module.exports = Query;
