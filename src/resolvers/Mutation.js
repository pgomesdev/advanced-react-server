const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')

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
  },
  signup: async (parent, args, context, info) => {
    args.email = args.email.toLowerCase()

    const password = await bcrypt.hash(args.password, 10)

    const user = await context.db.mutation.createUser({
      data: {
        ...args,
        password,
        permissions: {
          set: ['USER'],
        },
      }
    }, info)

    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)

    context.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })

    return user;
  },
  signin: async (parent, { email, password }, context, info) => {

    const user = await context.db.query.user({
      where: {
        email,
      },
    })

    if (!user) {
      throw new Error(`NO such user found for email ${email}`)
    }

    const valid = await bcrypt.compare(password, user.password)

    if (!valid) {
      throw new Error('Invalid password!')
    }

    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)

    context.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })

    return user
  },
  signout: (parent, args, context, info) => {
    context.response.clearCookie('token')

    return {
      message: 'Logout succesfully!'
    }
  },
  requestReset: async (parent, { email }, context, info) => {
    const user = await context.db.query.user({ where: { email } })

    if (!user) {
      throw new Error(`NO such user found for email ${email}`)
    }

    const resetToken = (await promisify(randomBytes)(20)).toString('hex')
    const resetTokenExpiry = Date.now() + 3600000
    const res = await context.db.mutation.updateUser({
      where: { email },
      data: { resetToken, resetTokenExpiry },
    })

    // TODO: send an email

    return {
      message: 'Thanks!'
    }
  },
  resetPassword: async (parent, args, context, info) => {
    if (args.password !== args.confirmPassword) {
      throw new Error('Your passwords don\'t match!')
    }

    const [user] = await context.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    })

    if (!user) {
      throw new Error('This token is either invalid or expired!')
    }

    const password = await bcrypt.hash(args.password, 10)

    const updatedUser = await context.db.mutation.updateUser({
      where: {
        email: user.email,
      },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null,
      },
    }, info)

    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET)

    context.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })

    return updatedUser
  },
};

module.exports = Mutation;
