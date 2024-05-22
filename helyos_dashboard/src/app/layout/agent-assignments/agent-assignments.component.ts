import { Component, OnInit } from '@angular/core';
import { HelyosService } from '../../services/helyos.service';
import { H_Assignment } from 'helyosjs-sdk';
import { ToolPose } from 'helyosjs-sdk/dist/helyos.models';
import { NgbDate, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';

@Component({
    selector: 'app-agent-assignments',
    templateUrl: './agent-assignments.component.html',
    styleUrls: ['./agent-assignments.component.scss']
})
export class AgentAssignmentsComponent implements OnInit {
    public assignments: H_Assignment[];
    public selectedItem: H_Assignment;
    public startDate_ngbDateStruct: NgbDateStruct;
    public filterObj: any = {};
    public first: number = 15;
    public page: number = 1;
    public filterWprocId: number = null;

    constructor(private helyosService: HelyosService) {

    }

    ngOnInit() {
        this.list();
    }


    list() {
    const offset = (this.page - 1)*this.first;
    return this.helyosService.methods.assignments.list(this.filterObj, this.first, offset)
        .then( r => this.assignments = r );
    }

    filterList(pageDelta:number=0) {
        this.page += pageDelta;
        if (this.page < 1){
            this.page = 1;
        }
        this.filterObj = {};
        if (this.filterWprocId) {
            this.filterObj['workProcessId'] = this.filterWprocId;
        }

        this.list();
    }

    create() {
        const newItem={status: 'draft'}
        this.helyosService.methods.assignments.create(newItem)
        .then( r=> {
            console.log(r);
            this.list().then( () =>  this.getItem(r.id) );
        });
    }

    getItem(itemId) {
        this.helyosService.methods.assignments.get(itemId)
        .then( (r:any)=> {
            this.selectedItem = r;   
            this.selectedItem['data'] = JSON.stringify(r['data'], undefined, 4) as any;
            this.selectedItem['context'] = JSON.stringify(r['context'], undefined, 4) as any;
            this.selectedItem['result'] = JSON.stringify(r['result'], undefined, 4) as any;

        })

    }

    sendCancelSignal(item){
        if (confirm(`Canceling an assigment may disrupt the current mission, ` +
                     `resulting in an inconsistent state. It is advisable to cancel the mission instead. ` +
                     `Press OK to continue.`)){ 
            this.editItem(item, "canceling");
        }
    }

    editItem(item, status=null) {
        if (status) {
            item.status = status;
        }
        const patch = {...item};

        if (item['data']) {
            try {
                patch['data'] = JSON.parse(item['data']);
            } catch (error) {
                alert('error: Data is not a valid JSON.');
                return;
            }
        } 

        if (item['context']) {
            try {
                patch['context'] = JSON.parse(item['context']);
            } catch (error) {
                alert('error: Context is not a valid JSON.');
                return;
            }
        }


        if (item['result']) {
            try {
                patch['result'] = JSON.parse(item['result']);
            } catch (error) {
                alert('error: Result Data is not a valid JSON.');
                return;
            }
        }

        delete patch.createdAt;
        delete patch.modifiedAt;

        this.helyosService.methods.assignments.patch(patch)
        .then( r=> {
            this.list();
        }).catch( e => {
            alert(JSON.stringify(e));
        });
    }



    downloadData() {
            this.downloadObject(this.selectedItem.data,
                                 `assignment_data_${this.selectedItem.id}.json`,
                                 'application/json');
    }

    downloadObject(content, fileName, contentType) {
        var a = document.createElement("a");
        var file = new Blob([content], {type: contentType});
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
    }
}
