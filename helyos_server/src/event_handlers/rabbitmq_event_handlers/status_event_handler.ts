import * as DatabaseService  from '../../services/database/database_services';
import { logData } from '../../modules/systemlog';
import * as memDBService from '../../services/in_mem_database/mem_database_service';
import { MISSION_STATUS, ASSIGNMENT_STATUS } from '../../modules/data_models';

interface Assignment {
    id: string;
    status: ASSIGNMENT_STATUS;
    result?: any;
    work_process_id?: string;
}

interface ObjMsg {
    body: {
        status: string;
        resources?: any;
        assignment?: Assignment;
        wp_clearance?: Assignment;
    };
}

interface AgentUpdate {
    uuid: string;
    status: string;
    last_message_time: Date;
    resources?: any;
}

const evaluateAssignmentUpdate = async (currentAssm: Assignment, assmUpdate: Assignment, uuid: string): Promise<boolean> => {
    const databaseServices = await DatabaseService.getInstance();
    
    if (currentAssm.status !== assmUpdate.status) {
        if (currentAssm.status === ASSIGNMENT_STATUS.COMPLETED && assmUpdate.status === ASSIGNMENT_STATUS.SUCCEEDED) {
            return Promise.resolve(false);
        }
        if ([ASSIGNMENT_STATUS.SUCCEEDED, ASSIGNMENT_STATUS.COMPLETED, ASSIGNMENT_STATUS.FAILED].includes(currentAssm.status)) {
            logData.addLog('agent', { uuid }, 'warn', `agent tried to change the status of an assignment that is already ${currentAssm.status}`);
            return Promise.resolve(false);
        }
        if ([ASSIGNMENT_STATUS.CANCELED, ASSIGNMENT_STATUS.ABORTED, ASSIGNMENT_STATUS.FAILED].includes(assmUpdate.status)) {
            logData.addLog('agent', { uuid }, 'info', `agent has marked the assignment ${currentAssm.id} as ${assmUpdate.status}`);
            return databaseServices.assignments.update_byId(currentAssm.id, assmUpdate).then(() => true);
        }
        return databaseServices.assignments.updateByConditions({
            'assignments.id': currentAssm.id,
            'work_processes.id': currentAssm.work_process_id,
            'work_processes.status__in': [
                MISSION_STATUS.EXECUTING,
                MISSION_STATUS.DISPATCHED,
                MISSION_STATUS.CALCULATING,
                MISSION_STATUS.CANCELING,
                MISSION_STATUS.FAILED
            ]
        }, assmUpdate).then(() => true);
    }

    if (assmUpdate.status === ASSIGNMENT_STATUS.ACTIVE || assmUpdate.status === ASSIGNMENT_STATUS.EXECUTING) {
        return databaseServices.assignments.updateByConditions({
            'assignments.id': currentAssm.id,
            'work_processes.id': currentAssm.work_process_id,
            'work_processes.status__in': [
                MISSION_STATUS.EXECUTING,
                MISSION_STATUS.DISPATCHED,
                MISSION_STATUS.CALCULATING,
                MISSION_STATUS.CANCELING,
                MISSION_STATUS.FAILED
            ]
        }, assmUpdate).then(() => true);
    }

    return Promise.resolve(false);
};

async function updateAgentMission(assignment: Assignment, uuid: string): Promise<void> {
    const databaseServices = await DatabaseService.getInstance();

    if (!assignment) return;
    const assignment_status_obj = assignment['assignment_status'] ? assignment['assignment_status'] : assignment;
    const assignmentId = assignment_status_obj.id;
    if (!assignmentId) return;
    const assignmentStatus = assignment_status_obj.status;
    const assignmentResult = assignment_status_obj.result;

    const assmUpdate = { id: assignmentId, status: assignmentStatus, result: assignmentResult };
    const currentAssm = await databaseServices.assignments.get_byId(assignmentId, ['id', 'status', 'work_process_id']);
    if (!currentAssm) return;

    if (await evaluateAssignmentUpdate(currentAssm, assmUpdate, uuid)) {
        if (uuid) {
            const updatedAssignment = { ...currentAssm, ...assmUpdate };
            await databaseServices.agents.updateByConditions({ uuid }, { assignment: updatedAssignment });
        }
    }
}

async function updateState(objMsg: ObjMsg, uuid: string, bufferPeriod: number = 0): Promise<void> {
    const databaseServices = await DatabaseService.getInstance();

    try {
        const agentUpdate: AgentUpdate = { uuid, status: objMsg.body.status, last_message_time: new Date() };
        const inMemDB = await memDBService.getInstance();

        const agentInMem = await inMemDB.agents[uuid];
        if (!agentInMem || !agentInMem.id) {
            const ids = await databaseServices.agents.getIds([uuid]);
            inMemDB.update('agents', 'uuid', { uuid, id: ids[0] }, agentUpdate.last_message_time);
            console.log(`Database query: agent ${uuid} has ID = ${ids[0]}`);
        }

        if (objMsg.body.resources) {
            agentUpdate.resources = objMsg.body.resources;
        }

        inMemDB.countMessages('agents_stats', uuid, 'updtPerSecond');
        await databaseServices.agents.updateByConditions({ uuid }, agentUpdate);

        if (objMsg.body.assignment) {
            return updateAgentMission(objMsg.body.assignment, uuid);
        }

    } catch (error:any) {
        logData.addLog('agent', { uuid }, 'info', `${uuid} published state "${objMsg.body?.status}": ${error.message}`);
        return;
    }
}

export  {updateState};