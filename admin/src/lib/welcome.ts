/** The message a super admin sends someone they have just made a portal
 *  user, with what they need to sign in. */
export function welcomeMessage(input: {
  clubName: string;
  role: 'clubadmin' | 'bonspieladmin';
  email: string;
  password: string;
  portalUrl: string;
  /** Only for a new club's first admin, who sets the scoreboards up. */
  pin?: string;
}): string {
  const lines = [
    `You can now sign in to the Curling Scoreboard admin portal as a ${input.role === 'clubadmin' ? 'club admin' : 'bonspiel admin'} for ${input.clubName}.`,
    '',
    `Portal: ${input.portalUrl}`,
    `Email: ${input.email}`,
    `Password: ${input.password}`,
  ];
  if (input.pin) {
    lines.push('', `The scoreboard admin PIN is ${input.pin}. A scoreboard asks for it before it disconnects from a sheet. You can change it under Settings, Scoreboards.`);
  }
  lines.push('', 'The guides are under Help in the portal.');
  return lines.join('\n');
}
