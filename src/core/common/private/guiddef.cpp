#include "common/public/guiddef.h"

namespace tsstg
{
    namespace guid
    {
        static std::map<GUID, InterfaceQueryFunc> gInterfaceQueryFuncTable;

        InterfaceQueryFunc GetInterfaceQueryFunc(const GUID& guid)
        {
            auto it = gInterfaceQueryFuncTable.find(guid);
            if (it == gInterfaceQueryFuncTable.end())
                return nullptr;
            return it->second;
        }

        void SetInterfaceQueryFunc(const GUID& guid, InterfaceQueryFunc func)
        {
            gInterfaceQueryFuncTable[guid] = func;
        }
    } // namespace guid
} // namespace tsstg