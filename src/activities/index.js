import {
  getCreateEmployeeAccountDefinition,
} from "./createEmployeeAccount.js";

// import {
//   getInviteUserToGroupDefinition,
// } from "./inviteUserToGroup.js";

export function getActivityDefinitions(origin, chatOptions = {}) {
  return [
    getCreateEmployeeAccountDefinition(origin),
    // getInviteUserToGroupDefinition(origin, chatOptions),
  ];
}