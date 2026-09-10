import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/process/:path*",
    "/history/:path*",
    "/settings/:path*",
  ],
};