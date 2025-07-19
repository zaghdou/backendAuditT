import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const { email, password } = credentials as { email: string; password: string };

        try {
          console.log('Attempting login with:', { email });

          // Static credentials check
          if (email === 'admin@materialize.com' && password === 'admin') {
            console.log('Authentication successful');
            // Return user object compatible with NextAuth.js
            return {
              id: '1', // Must be a string
              email: 'admin@materialize.com',
              name: 'Admin',
            };
          }

          console.log('Authentication failed: Invalid credentials');
          throw new Error('CredentialsSignin');
        } catch (error: any) {
          console.error('Error in authorize:', error.message);
          throw new Error('CredentialsSignin');
        }
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name;
      }
      return session;
    },
  },
  debug: true,
};

export default NextAuth(authOptions);
