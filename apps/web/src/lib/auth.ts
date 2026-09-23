import type { NextAuthOptions, Session, User } from 'next-auth';
import type { AdapterUser } from 'next-auth/adapters';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(
  /\/$/,
  ''
);

type AppUser = User & {
  tier?: string;
  accessToken?: string;
};

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (!data?.token || !data?.user) return null;

        return {
          id: String(data.user.id),
          email: data.user.email,
          name: data.user.name ?? data.user.email,
          tier: data.user.tier ?? 'free',
          accessToken: data.token,
        } as AppUser;
      },
    }),
  ],
  callbacks: {
    async jwt(params: { token: JWT; user?: User | AdapterUser }) {
      const { token, user } = params;

      if (user) {
        const u = user as AppUser;
        token.id = u.id;
        token.email = u.email;
        token.tier = u.tier;
        token.accessToken = u.accessToken;
      }

      return token;
    },
    async session(params: { session: Session; token: JWT }) {
      const { session, token } = params;

      session.user = {
        ...session.user,
        id: token.id as string | undefined,
        email: (token.email as string | null | undefined) ?? session.user?.email,
        name: session.user?.name,
        tier: token.tier as string | undefined,
      } as Session['user'];

      (session as Session & { accessToken?: string }).accessToken =
        token.accessToken as string | undefined;

      return session;
    },
  },
};

export function getApiBase() {
  return API_BASE;
<<<<<<< HEAD
}
=======
}
>>>>>>> 393e67f (chore: bump next to 15.1.11 for Railway CVE gate)
