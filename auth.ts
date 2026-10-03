import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

const tenant = process.env.AZURE_TENANT_ID ?? '';

/**
 * Microsoft sign-in restricted to the MHCA tenant: single-tenant issuer plus an explicit `tid` check.
 * Sessions are short (8 hours) and carry no patient data.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  trustHost: true,
  callbacks: {
    signIn({ profile }) {
      return Boolean(tenant) && (profile as { tid?: string } | undefined)?.tid === tenant;
    },
  },
});
