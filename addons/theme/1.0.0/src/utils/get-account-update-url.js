export default function (account) {
  switch (account.type) {
    case 'Team':
      return 'team';
    case 'TeamMember':
      return `team/members/${account.user_id}`;
    case 'User':
      return 'me';
    default:
      throw new Error(`Invalid account type: ${account.type}`);
  }
}
