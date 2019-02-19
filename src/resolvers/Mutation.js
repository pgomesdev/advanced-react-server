const Mutation = {
  createItem: async (parent, args, context, info) => {
    // TODO: Check if logged in

    const item = await context.db.mutation.createItem({
      data: {
        ...args,
      },
    }, info);

    return item;
  },
  updateItem: (parent, args, context, info) => {
    // first take a copy of the updates
    const updates = { ...args }

    // remove the id from the updates
    delete updates.id

    // run the update method
    return context.db.mutation.updateItem({
      data: updates,
      where: {
        id: args.id,
      },
    }, info)
  },
  deleteItem: async (parent, args, context, info) => {
    const where = { id: args.id }

    const item = await context.db.query.item({ where }, `{ id title }`)
    // 2. TODO: check if they own that item, or have the permissions]
    // 3. delete it
    return context.db.mutation.deleteItem({ where }, info)
  }
};

module.exports = Mutation;
