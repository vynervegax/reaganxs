import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      tier?: string;
    };
  }

  interface User {
    id?: string;
    tier?: string;
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    email?: string | null;
    tier?: string;
    accessToken?: string;
  }
}