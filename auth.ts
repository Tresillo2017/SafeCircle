import NextAuth, { type NextAuthConfig, type DefaultSession, User } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { compare } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { JWT } from "next-auth/jwt"

// Extend JWT type
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accountType?: string;
  }
}

// Extend User type to include accountType
declare module "next-auth" {
  interface User {
    accountType: string;
  }
  interface Session extends DefaultSession {
    user: {
      id: string;
      accountType: string;
    } & DefaultSession["user"]
  }
}

export const config = {
  adapter: PrismaAdapter(prisma) as any, // Temporary type assertion to resolve conflict
  providers: [
    Credentials({
      async authorize(credentials: Partial<Record<string, unknown>>) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string }
        })

        if (!user || !user.password) {
          return null
        }

        const isValid = await compare(
          credentials.password as string,
          user.password
        )

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          accountType: user.accountType
        }
      }
    })
  ],
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
    newUser: '/auth/onboarding'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.accountType = user.accountType
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        if (token.id) session.user.id = token.id
        if (token.accountType) session.user.accountType = token.accountType
      }
      return session
    },
    async signIn({ user }) {
      if (!user) return false

      const onboarding = await prisma.onboardingStatus.findUnique({
        where: { userId: user.id }
      })
      
      if (!onboarding) {
        return '/auth/onboarding'
      }
      
      return true
    },
    async redirect({ url, baseUrl }) {
      // Handle redirect after sign in
      if (url.startsWith(baseUrl)) return url
      if (url.startsWith('/')) return `${baseUrl}${url}`
      return baseUrl
    }
  },
  session: {
    strategy: "jwt"
  },
  debug: process.env.NODE_ENV === "development",
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(config)