const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')
const { hasPermission } = require('../utils')
const { transport, makeANiceEmail } = require('../mail')
const stripe = require('../stripe')

const Mutation = {
  createItem: async (parent, args, context, info) => {
    if (!context.request.userId) {
      throw new Error('You must be logged in to do that!')
    }

    const item = await context.db.mutation.createItem({
      data: {
        // This is how we create relationship between the item and the user
        user: {
          connect: {
            id: context.request.userId,
          },
        },
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
    if (!context.request.userId) {
      throw new Error('You must be logged in')
    }

    const where = { id: args.id }

    const item = await context.db.query.item({ where }, `{ id title user { id } }`)
    
    const ownsItem = item.user.id === context.request.userId
    const hasPermissions = context.request.user.permissions.some(permission => ['ADMIN', 'ITEMDELETE'].includes(permission))

    if (!ownsItem && !hasPermissions) {
      throw new Error('You don\'t have permission to do that!')
    }

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

    const mailRes = await transport.sendMail({
      from: 'pgomesdev@gmail.com',
      to: user.email,
      subject: 'Your password reset token',
      html: makeANiceEmail(`
        Your password reset Token is here!
        \n\n
        <a href='${process.env.FRONTEND_url}/reset?resetToken=${resetToken}'>Click here to reset</a>
      `)
    })

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
  updatePermissions: async (parent, { permissions, userId }, context, info) => {
    if (!context.request.userId) {
      throw new Error('You must be logged in')
    }

    const currentUser = await context.db.query.user({
      where: {
        id: context.request.userId,
      }
    }, info)

    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE'])

    return context.db.mutation.updateUser({
      data: {
        permissions: {
          set: permissions,
        },
      },
      where: {
        id: userId,
      },
    }, info)
  },
  addToCart: async (parent, args, context, info) => {
    const { userId } = context.request

    if (!userId) {
      throw new Error('You must be logged in')
    }

    const [existingCartItem] = await context.db.query.cartItems({
      where: {
        user: { id: userId },
        item: { id: args.id },
      }
    })

    if (existingCartItem) {
      return context.db.mutation.updateCartItem({
        where: { id: existingCartItem.id },
        data: { quantity: existingCartItem.quantity + 1 },
      }, info)
    }

    return context.db.mutation.createCartItem({
      data: {
        user: {
          connect: { id: userId },
        },
        item: {
          connect: { id: args.id },
        },
      },
    }, info)
  },
  removeFromCart: async (parent, args, context, info) => {
    const { userId } = context.request

    if (!userId) {
      throw new Error('You must be logged in')
    }

    const cartItem = await context.db.query.cartItem({
      where: {
        id: args.id,
      },
    }, `{ id, user { id } }`)

    if (!cartItem) {
      throw new Error('No cart item found')
    }

    if (cartItem.user.id !== userId) {
      throw new Error('Error')
    }

    return context.db.mutation.deleteCartItem({
      where: {
        id: args.id,
      },
    }, info)
  },
  createOrder: async (parent, args, context, info) => {
    const { userId } = context.request

    if (!userId) {
      throw new Error('You must be logged in')
    }

    const user = await context.db.query.user(
      { where: { id: userId } },
      `
        {
          id
          name
          email
          cart {
            id
            quantity
            item {
              title
              price
              id
              description
              image
            }
          }
        }
      `
    )

    // recalculate the total for the price
    const amount = user.cart.reduce(
      (tally, cartItem) => tally + cartItem.item.price * cartItem.quantity,
      0
    )

    const charge = await stripe.charges.create({
      amount,
      currency: 'USD',
      source: args.token,
    })

    console.log('charge', charge)
  },
};

module.exports = Mutation;
