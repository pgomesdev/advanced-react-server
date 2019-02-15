const Query = {
  items: (parent, args, context, info) => {
    return context.db.query.items();
  }
};

module.exports = Query;
